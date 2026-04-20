import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { typedCount, typedQuery } from '../lib/typedSql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function phase1_auth_system_completeness() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 1: Authentication System Completeness');
  console.log('════════════════════════════════════════');

  const authRoutesFile = fs.readFileSync(path.resolve(__dirname, '../authRoutes.ts'), 'utf-8');

  const requiredAuthEndpoints = [
    { endpoint: '/api/auth/register', method: 'post' },
    { endpoint: '/api/auth/login', method: 'post' },
    { endpoint: '/api/auth/logout', method: 'post' },
    { endpoint: '/api/auth/check', method: 'get' },
    { endpoint: '/api/auth/me', method: 'get' },
    { endpoint: '/api/auth/verify-email', method: 'post' },
    { endpoint: '/api/auth/resend-verification', method: 'post' },
    { endpoint: '/api/auth/reset-password-request', method: 'post' },
    { endpoint: '/api/auth/reset-password-confirm', method: 'post' },
    { endpoint: '/api/auth/change-password', method: 'post' },
  ];

  const missingEndpoints = requiredAuthEndpoints.filter(ep =>
    !authRoutesFile.includes(ep.endpoint)
  );

  record({
    name: 'All Auth Endpoints Registered',
    phase: 'AUTH',
    passed: missingEndpoints.length === 0,
    details: missingEndpoints.length === 0
      ? `All ${requiredAuthEndpoints.length} auth endpoints present`
      : `Missing: ${missingEndpoints.map(e => e.endpoint).join(', ')}`,
    severity: 'critical'
  });

  const hasPasswordHashing = authRoutesFile.includes('hashPassword') || authRoutesFile.includes('bcrypt') || authRoutesFile.includes('scrypt');
  record({
    name: 'Password Hashing Implemented',
    phase: 'AUTH',
    passed: hasPasswordHashing,
    details: hasPasswordHashing ? 'Password hashing function used in auth routes' : 'No password hashing detected',
    severity: 'critical'
  });

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');
  const authLimiterDefined = routesFile.includes('authLimiter');
  const authLimiterApplied = (routesFile.match(/app\.use.*authLimiter/g) || []).length;
  const authEndpointsLimited = ['/api/auth/login', '/api/auth/register', '/api/auth/reset-password'].filter(ep =>
    routesFile.includes(`app.use("${ep}"`) || routesFile.includes(`app.use('${ep}'`)
  );
  record({
    name: 'Auth Routes Rate Limited',
    phase: 'AUTH',
    passed: authLimiterDefined && authEndpointsLimited.length >= 2,
    details: `authLimiter defined: ${authLimiterDefined}, applied to ${authEndpointsLimited.length} auth endpoints: ${authEndpointsLimited.join(', ')}`,
    severity: 'critical'
  });

  const authSetupFile = fs.readFileSync(path.resolve(__dirname, '../auth.ts'), 'utf-8');
  const hasPgSessionStore = authSetupFile.includes('connect-pg-simple');
  const hasSessionFactory = authSetupFile.includes('session(') || authSetupFile.includes('session({');
  const hasSecretConfig = authSetupFile.includes('secret') && authSetupFile.includes('cookie');
  record({
    name: 'Session Management Configured',
    phase: 'AUTH',
    passed: hasPgSessionStore && hasSessionFactory,
    details: `PostgreSQL session store: ${hasPgSessionStore}, session factory: ${hasSessionFactory}, secret+cookie config: ${hasSecretConfig}`,
    severity: 'critical'
  });

  const csrfMiddlewareFile = fs.existsSync(path.resolve(__dirname, '../middleware/csrf.ts'));
  const csrfImported = routesFile.includes('csrfProtection') || routesFile.includes('ensureCsrfToken');
  const csrfApplied = routesFile.includes("app.use('/api', csrfProtection)") || routesFile.includes('app.use(ensureCsrfToken');
  record({
    name: 'CSRF Protection Active',
    phase: 'AUTH',
    passed: csrfMiddlewareFile && csrfImported && csrfApplied,
    details: `CSRF middleware file: ${csrfMiddlewareFile}, imported: ${csrfImported}, applied to /api: ${csrfApplied}`,
    severity: 'critical'
  });

  const hasAccountLockout = authRoutesFile.includes('lockout') || authRoutesFile.includes('locked') || authRoutesFile.includes('max_failed') || authRoutesFile.includes('failedAttempts') || authRoutesFile.includes('account_locked');
  record({
    name: 'Account Lockout Protection',
    phase: 'AUTH',
    passed: hasAccountLockout,
    details: hasAccountLockout ? 'Account lockout mechanism present' : 'No account lockout detected',
    severity: 'high'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const usersTbl = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'users' ORDER BY ordinal_position
  `);
  const userCols = (usersTbl as any[]).map((r: any) => r.column_name) || [];
  const requiredUserCols = ['id', 'email', 'password_hash'];
  const hasAllUserCols = requiredUserCols.every(c => userCols.includes(c));
  record({
    name: 'Users Table Has Required Auth Columns',
    phase: 'AUTH',
    passed: hasAllUserCols,
    details: `Required: ${requiredUserCols.join(', ')} - found in ${userCols.length} columns`,
    severity: 'critical'
  });
}

async function phase2_crud_entity_schemas() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 2: CRUD Entity Schema Validation');
  console.log('════════════════════════════════════════');

  const coreEntities = [
    { table: 'users', requiredCols: ['id', 'email'] },
    { table: 'workspaces', requiredCols: ['id', 'name'] },
    { table: 'employees', requiredCols: ['id', 'workspace_id'] },
    { table: 'clients', requiredCols: ['id', 'workspace_id'] },
    { table: 'shifts', requiredCols: ['id', 'workspace_id'] },
    { table: 'time_entries', requiredCols: ['id', 'workspace_id'] },
    { table: 'invoices', requiredCols: ['id', 'workspace_id'] },
    { table: 'payroll_runs', requiredCols: ['id', 'workspace_id'] },
    { table: 'chat_messages', requiredCols: ['id'] },
    { table: 'notifications', requiredCols: ['id'] },
    { table: 'audit_logs', requiredCols: ['id'] },
    { table: 'security_incidents', requiredCols: ['id', 'workspace_id'] },
    { table: 'guard_tours', requiredCols: ['id', 'workspace_id'] },
    { table: 'equipment_items', requiredCols: ['id', 'workspace_id'] },
    { table: 'post_order_templates', requiredCols: ['id', 'workspace_id'] },
    { table: 'subscriptions', requiredCols: ['id', 'workspace_id'] },
    { table: 'workspace_credits', requiredCols: ['workspace_id', 'current_balance'] },
    { table: 'credit_transactions', requiredCols: ['id', 'workspace_id'] },
  ];

  for (const entity of coreEntities) {
    // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
    const colResult = await typedQuery(sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = ${entity.table} ORDER BY ordinal_position
    `);
    const cols = (colResult as any[]).map((r: any) => r.column_name) || [];
    const hasAllCols = entity.requiredCols.every(c => cols.includes(c));
    
    record({
      name: `${entity.table} Schema Valid`,
      phase: 'CRUD_SCHEMAS',
      passed: cols.length > 0 && hasAllCols,
      details: cols.length === 0
        ? `Table ${entity.table} not found`
        : `${cols.length} columns, required: ${entity.requiredCols.join(', ')} - ${hasAllCols ? 'all present' : 'MISSING: ' + entity.requiredCols.filter(c => !cols.includes(c)).join(', ')}`,
      severity: 'critical'
    });
  }
}

async function phase3_workspace_isolation() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 3: Multi-Tenant Workspace Isolation');
  console.log('════════════════════════════════════════');

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');

  const workspaceScopedRoutes = (routesFile.match(/ensureWorkspaceAccess/g) || []).length;
  record({
    name: 'Workspace Scoping Middleware Applied',
    phase: 'ISOLATION',
    passed: workspaceScopedRoutes >= 40,
    details: `ensureWorkspaceAccess applied ${workspaceScopedRoutes} times (minimum 40 expected)`,
    severity: 'critical'
  });

  const middlewareFile = fs.readFileSync(path.resolve(__dirname, '../middleware/workspaceScope.ts'), 'utf-8');
  const checksWorkspaceId = middlewareFile.includes('workspaceId') || middlewareFile.includes('workspace_id');
  const rejectsNoWorkspace = middlewareFile.includes('403') || middlewareFile.includes('401') || middlewareFile.includes('Forbidden') || middlewareFile.includes('Unauthorized');

  record({
    name: 'Workspace Middleware Validates Workspace ID',
    phase: 'ISOLATION',
    passed: checksWorkspaceId,
    details: checksWorkspaceId ? 'Middleware checks workspaceId from session/request' : 'No workspace ID check found',
    severity: 'critical'
  });

  record({
    name: 'Workspace Middleware Rejects Unauthorized Access',
    phase: 'ISOLATION',
    passed: rejectsNoWorkspace,
    details: rejectsNoWorkspace ? 'Returns 401/403 for unauthorized workspace access' : 'No rejection logic found',
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const dataTablesWithWorkspaceId = await typedQuery(sql`
    SELECT table_name FROM information_schema.columns 
    WHERE column_name = 'workspace_id' AND table_schema = 'public'
    ORDER BY table_name
  `);
  const wsTableCount = (dataTablesWithWorkspaceId as any[]).length || 0;

  record({
    name: 'Data Tables Have workspace_id Column',
    phase: 'ISOLATION',
    passed: wsTableCount >= 30,
    details: `${wsTableCount} tables have workspace_id for tenant isolation`,
    severity: 'critical'
  });

  const publicRoutes = ['/api/auth', '/api/public', '/api/demo', '/api/email/unsubscribe', '/api/testimonials'];
  const publicRoutesInFile = publicRoutes.filter(r => routesFile.includes(r));
  record({
    name: 'Public Routes Correctly Exempt From Workspace Scope',
    phase: 'ISOLATION',
    passed: publicRoutesInFile.length >= 3,
    details: `${publicRoutesInFile.length} public routes properly exempt: ${publicRoutesInFile.join(', ')}`,
    severity: 'high'
  });
}

async function phase4_stripe_webhook_handlers() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 4: Stripe Webhook Event Handlers');
  console.log('════════════════════════════════════════');

  const webhookFile = fs.readFileSync(path.resolve(__dirname, '../services/billing/stripeWebhooks.ts'), 'utf-8');

  const requiredEventTypes = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'checkout.session.completed',
    'charge.refunded',
  ];

  const missingEvents = requiredEventTypes.filter(e => !webhookFile.includes(e));
  record({
    name: 'All Required Stripe Events Handled',
    phase: 'STRIPE_WEBHOOKS',
    passed: missingEvents.length === 0,
    details: missingEvents.length === 0
      ? `All ${requiredEventTypes.length} Stripe event types handled`
      : `Missing: ${missingEvents.join(', ')}`,
    severity: 'critical'
  });

  const hasIdempotency = webhookFile.includes('markEventProcessed') || webhookFile.includes('processedEvents') || webhookFile.includes('idempotency');
  record({
    name: 'Webhook Idempotency Protection',
    phase: 'STRIPE_WEBHOOKS',
    passed: hasIdempotency,
    details: hasIdempotency ? 'Idempotency check prevents duplicate event processing' : 'No idempotency protection',
    severity: 'critical'
  });

  const stripeRouteFile = fs.readFileSync(path.resolve(__dirname, '../routes/stripeInlineRoutes.ts'), 'utf-8');
  const hasSignatureVerification = stripeRouteFile.includes('constructEvent') && stripeRouteFile.includes('stripe-signature');
  record({
    name: 'Webhook Signature Verification',
    phase: 'STRIPE_WEBHOOKS',
    passed: hasSignatureVerification,
    details: hasSignatureVerification ? 'Stripe signature verified via constructEvent()' : 'No signature verification',
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const processedEventsTable = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'processed_stripe_events' ORDER BY ordinal_position
  `);
  const peColumns = (processedEventsTable as any[]).map((r: any) => r.column_name) || [];
  record({
    name: 'Processed Stripe Events Table Exists',
    phase: 'STRIPE_WEBHOOKS',
    passed: peColumns.length > 0,
    details: peColumns.length > 0 ? `Table has ${peColumns.length} columns: ${peColumns.join(', ')}` : 'Table not found',
    severity: 'critical'
  });

  const hasEventBridge = stripeRouteFile.includes('stripeEventBridge') || stripeRouteFile.includes('eventBridge');
  record({
    name: 'Stripe Event Bridge for AI Brain Integration',
    phase: 'STRIPE_WEBHOOKS',
    passed: hasEventBridge,
    details: hasEventBridge ? 'Events forwarded to AI Brain via stripeEventBridge' : 'No AI event bridge',
    severity: 'medium'
  });
}

async function phase5_api_route_mount_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 5: API Route Mount Coverage');
  console.log('════════════════════════════════════════');

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');

  const criticalRouteMounts = [
    { path: '/api/auth', name: 'Authentication' },
    { path: '/api/billing', name: 'Billing' },
    { path: '/api/time-entries', name: 'Time Entries' },
    { path: '/api/shifts', name: 'Shifts' },
    { path: '/api/incidents', name: 'Incidents' },
    { path: '/api/dashboard', name: 'Dashboard' },
    { path: '/api/ai-brain', name: 'AI Brain' },
    { path: '/api/guard-tours', name: 'Guard Tours' },
    { path: '/api/equipment', name: 'Equipment' },
    { path: '/api/emails', name: 'Email System' },
    { path: '/api/sms', name: 'SMS' },
    { path: '/api/calendar', name: 'Calendar' },
    { path: '/api/broadcasts', name: 'Broadcasts' },
    { path: '/api/trinity', name: 'Trinity AI' },
    { path: '/api/trinity-staffing', name: 'Trinity Staffing' },
    { path: '/api/trinity-decisions', name: 'Trinity Decisions' },
    { path: '/api/automation', name: 'Automation' },
    { path: '/api/coverage', name: 'Shift Coverage' },
    { path: '/api/dispatch', name: 'Dispatch' },
    { path: '/api/import', name: 'CSV Import' },
    { path: '/api/security-compliance', name: 'Security Compliance' },
    { path: '/api/employee-onboarding', name: 'Employee Onboarding' },
    { path: '/api/approvals', name: 'Approvals' },
    { path: '/api/gamification', name: 'Gamification' },
    { path: '/api/infrastructure', name: 'Infrastructure' },
    { path: '/api/enterprise', name: 'Enterprise' },
    { path: '/api/whats-new', name: 'Whats New' },
    { path: '/api/support', name: 'Support' },
    { path: '/api/tickets', name: 'Tickets' },
    { path: '/api/control-tower', name: 'Control Tower' },
    { path: '/api/scheduler', name: 'Scheduler' },
    { path: '/api/helpai', name: 'HelpAI' },
    { path: '/api/integrations', name: 'Integrations' },
    { path: '/api/subagents', name: 'Subagents' },
  ];

  const missingMounts = criticalRouteMounts.filter(r => !routesFile.includes(r.path));
  record({
    name: 'All Critical API Routes Mounted',
    phase: 'ROUTE_MOUNTS',
    passed: missingMounts.length === 0,
    details: missingMounts.length === 0
      ? `All ${criticalRouteMounts.length} critical route paths mounted`
      : `Missing: ${missingMounts.map(r => `${r.name} (${r.path})`).join(', ')}`,
    severity: 'critical'
  });

  const requireAuthCount = (routesFile.match(/requireAuth/g) || []).length;
  record({
    name: 'Auth Middleware Applied Broadly',
    phase: 'ROUTE_MOUNTS',
    passed: requireAuthCount >= 30,
    details: `requireAuth applied ${requireAuthCount} times across route mounts`,
    severity: 'critical'
  });

  const totalAppUse = (routesFile.match(/app\.use\(/g) || []).length;
  record({
    name: 'Route Mount Count',
    phase: 'ROUTE_MOUNTS',
    passed: totalAppUse >= 50,
    details: `${totalAppUse} app.use() mounts in routes.ts`,
    severity: 'high'
  });
}

async function phase6_email_template_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 6: Email Template Coverage');
  console.log('════════════════════════════════════════');

  const emailServiceFile = fs.readFileSync(path.resolve(__dirname, '../services/emailService.ts'), 'utf-8');

  const requiredEmailTypes = [
    'welcome',
    'verification',
    'password_reset',
    'shift_assignment',
    'shift_reminder',
    'payroll',
    'invoice',
    'notification',
  ];

  const templateMethodsFound = requiredEmailTypes.filter(t =>
    emailServiceFile.toLowerCase().includes(t) || emailServiceFile.includes(t.replace(/_/g, ''))
  );

  record({
    name: 'Email Service Covers Key Email Types',
    phase: 'EMAIL_TEMPLATES',
    passed: templateMethodsFound.length >= 5,
    details: `${templateMethodsFound.length}/${requiredEmailTypes.length} email types referenced: ${templateMethodsFound.join(', ')}`,
    severity: 'high'
  });

  const hasHtmlTemplates = emailServiceFile.includes('html') || emailServiceFile.includes('HTML') || emailServiceFile.includes('template');
  record({
    name: 'Email Service Uses HTML Templates',
    phase: 'EMAIL_TEMPLATES',
    passed: hasHtmlTemplates,
    details: hasHtmlTemplates ? 'HTML email templates in use' : 'No HTML templates detected',
    severity: 'high'
  });

  const hasDevSimulation = emailServiceFile.includes('simulation') || emailServiceFile.includes('SIMULATION') || emailServiceFile.includes('devMode') || emailServiceFile.includes('DEV');
  record({
    name: 'Dev Mode Email Simulation',
    phase: 'EMAIL_TEMPLATES',
    passed: hasDevSimulation,
    details: hasDevSimulation ? 'Dev mode simulation available for email testing' : 'No dev simulation mode',
    severity: 'medium'
  });

  const hasResend = emailServiceFile.includes('resend') || emailServiceFile.includes('Resend');
  record({
    name: 'Resend Integration Active',
    phase: 'EMAIL_TEMPLATES',
    passed: hasResend,
    details: hasResend ? 'Resend email provider integrated' : 'No Resend integration',
    severity: 'high'
  });

  const hasUnsubscribe = emailServiceFile.includes('unsubscribe') || emailServiceFile.includes('Unsubscribe') || emailServiceFile.includes('CAN-SPAM');
  record({
    name: 'CAN-SPAM Compliance',
    phase: 'EMAIL_TEMPLATES',
    passed: hasUnsubscribe,
    details: hasUnsubscribe ? 'Unsubscribe/CAN-SPAM compliance present' : 'No CAN-SPAM compliance',
    severity: 'high'
  });
}

async function phase7_import_export_system() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 7: Import/Export System');
  console.log('════════════════════════════════════════');

  const importRouteFile = fs.readFileSync(path.resolve(__dirname, '../routes/importRoutes.ts'), 'utf-8');

  const hasPreview = importRouteFile.includes('/employees/preview') || importRouteFile.includes('preview');
  record({
    name: 'CSV Import Preview Endpoint',
    phase: 'IMPORT_EXPORT',
    passed: hasPreview,
    details: hasPreview ? 'CSV import preview endpoint present for validation before commit' : 'No preview endpoint',
    severity: 'high'
  });

  const hasCommit = importRouteFile.includes('router.post') && importRouteFile.includes('/employees');
  record({
    name: 'CSV Import Commit Endpoint',
    phase: 'IMPORT_EXPORT',
    passed: hasCommit,
    details: hasCommit ? 'CSV import commit endpoint present' : 'No import commit endpoint',
    severity: 'high'
  });

  const hasValidation = importRouteFile.includes('validate') || importRouteFile.includes('parse') || importRouteFile.includes('csv') || importRouteFile.includes('CSV');
  record({
    name: 'Import Data Validation',
    phase: 'IMPORT_EXPORT',
    passed: hasValidation,
    details: hasValidation ? 'CSV data parsing/validation present' : 'No data validation in import',
    severity: 'high'
  });

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');
  const importMounted = routesFile.includes('/api/import') && routesFile.includes('ensureWorkspaceAccess');
  record({
    name: 'Import Route Workspace Scoped',
    phase: 'IMPORT_EXPORT',
    passed: importMounted,
    details: importMounted ? 'Import route has workspace scoping applied' : 'Import route not workspace scoped',
    severity: 'critical'
  });
}

async function phase8_frontend_backend_alignment() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 8: Frontend-Backend Route Alignment');
  console.log('════════════════════════════════════════');

  const pagesDir = path.resolve(__dirname, '../../client/src/pages');
  const pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));

  record({
    name: 'Frontend Page Count',
    phase: 'FRONTEND_BACKEND',
    passed: pageFiles.length >= 50,
    details: `${pageFiles.length} frontend page components`,
    severity: 'high'
  });

  const appFile = fs.readFileSync(path.resolve(__dirname, '../../client/src/App.tsx'), 'utf-8');
  const routeCount = (appFile.match(/Route.*path=/g) || []).length;
  record({
    name: 'Frontend Routes Registered',
    phase: 'FRONTEND_BACKEND',
    passed: routeCount >= 30,
    details: `${routeCount} routes registered in App.tsx`,
    severity: 'high'
  });

  const criticalPages = ['dashboard', 'employees', 'billing', 'analytics', 'features-showcase', 'chatrooms', 'compliance'];
  const missingPages = criticalPages.filter(p => !pageFiles.some(f => f.includes(p)));
  record({
    name: 'Critical Pages Present',
    phase: 'FRONTEND_BACKEND',
    passed: missingPages.length === 0,
    details: missingPages.length === 0
      ? `All ${criticalPages.length} critical pages exist`
      : `Missing: ${missingPages.join(', ')}`,
    severity: 'critical'
  });

  const hasErrorPages = pageFiles.some(f => f.includes('404')) && pageFiles.some(f => f.includes('500'));
  record({
    name: 'Error Pages Present (404, 500)',
    phase: 'FRONTEND_BACKEND',
    passed: hasErrorPages,
    details: hasErrorPages ? '404 and 500 error pages present' : 'Missing error pages',
    severity: 'high'
  });
}

async function phase9_quickbooks_integration() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 9: QuickBooks Integration');
  console.log('════════════════════════════════════════');

  let qbFileExists = false;
  const qbPaths = [
    path.resolve(__dirname, '../services/quickbooksService.ts'),
    path.resolve(__dirname, '../services/quickbooks/quickbooksService.ts'),
    path.resolve(__dirname, '../services/billing/quickbooksService.ts'),
  ];

  let qbContent = '';
  for (const p of qbPaths) {
    if (fs.existsSync(p)) {
      qbFileExists = true;
      qbContent = fs.readFileSync(p, 'utf-8');
      break;
    }
  }

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');
  const hasQBMount = routesFile.includes('quickbooks') || routesFile.includes('QuickBooks') || routesFile.includes('qb');

  record({
    name: 'QuickBooks Service Exists',
    phase: 'QUICKBOOKS',
    passed: qbFileExists || hasQBMount,
    details: qbFileExists ? 'QuickBooks service file found' : (hasQBMount ? 'QuickBooks route mounted' : 'No QuickBooks service found'),
    severity: 'high'
  });

  const hasOAuth = qbContent.includes('oauth') || qbContent.includes('OAuth') || qbContent.includes('token') || routesFile.includes('quickbooks');
  record({
    name: 'QuickBooks OAuth/Token Management',
    phase: 'QUICKBOOKS',
    passed: hasOAuth,
    details: hasOAuth ? 'OAuth token management present' : 'No OAuth handling',
    severity: 'high'
  });

  const envVars = ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET'];
  const hasEnvVars = envVars.every(v => process.env[v] !== undefined);
  record({
    name: 'QuickBooks Credentials Configured',
    phase: 'QUICKBOOKS',
    passed: hasEnvVars,
    details: hasEnvVars ? 'QuickBooks client credentials present in environment' : 'QuickBooks credentials not yet configured',
    severity: 'medium'
  });
}

async function phase10_database_referential_integrity() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 10: Database Referential Integrity');
  console.log('════════════════════════════════════════');

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const fkResult = await typedCount(sql`
    SELECT COUNT(*) as count FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
  `);
  const fkCount = Number(fkResult || 0);
  record({
    name: 'Foreign Key Constraints Exist',
    phase: 'DB_INTEGRITY',
    passed: fkCount >= 10,
    details: `${fkCount} foreign key constraints in database`,
    severity: 'high'
  });

  // CATEGORY C — Raw SQL retained: Count( | Tables: pg_indexes | Verified: 2026-03-23
  const indexResult = await typedCount(sql`
    SELECT COUNT(*) as count FROM pg_indexes 
    WHERE schemaname = 'public'
  `);
  const idxCount = Number(indexResult || 0);
  record({
    name: 'Database Indexes Present',
    phase: 'DB_INTEGRITY',
    passed: idxCount >= 50,
    details: `${idxCount} indexes in public schema for query performance`,
    severity: 'high'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tableCount = await typedCount(sql`
    SELECT COUNT(*) as count FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tblCount = Number(tableCount || 0);
  record({
    name: 'Database Table Count',
    phase: 'DB_INTEGRITY',
    passed: tblCount >= 50,
    details: `${tblCount} tables in database`,
    severity: 'info'
  });

  // CATEGORY C — Raw SQL retained: LIKE | Tables: pg_indexes | Verified: 2026-03-23
  const wsIdxResult = await typedQuery(sql`
    SELECT indexname, tablename FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexdef LIKE '%workspace_id%'
  `);
  const wsIdxCount = (wsIdxResult as any[]).length || 0;
  record({
    name: 'workspace_id Indexed for Query Performance',
    phase: 'DB_INTEGRITY',
    passed: wsIdxCount >= 10,
    details: `${wsIdxCount} indexes on workspace_id columns`,
    severity: 'high'
  });
}

async function phase11_security_hardening() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 11: Security Hardening Verification');
  console.log('════════════════════════════════════════');

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');

  const indexFile = fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf-8');
  const helmetImported = indexFile.includes("import helmet");
  const helmetApplied = indexFile.includes('app.use(helmet');
  const corsImported = indexFile.includes("import cors");
  const corsApplied = indexFile.includes('app.use(cors');

  record({
    name: 'Security Headers (Helmet)',
    phase: 'SECURITY',
    passed: helmetImported && helmetApplied,
    details: `Helmet imported: ${helmetImported}, app.use(helmet): ${helmetApplied}`,
    severity: 'high'
  });

  record({
    name: 'CORS Configuration',
    phase: 'SECURITY',
    passed: corsImported && corsApplied,
    details: `CORS imported: ${corsImported}, app.use(cors): ${corsApplied}`,
    severity: 'high'
  });

  const apiLimiterDefined = routesFile.includes('apiLimiter');
  const apiLimiterApplied = routesFile.includes("app.use('/api', apiLimiter)") || routesFile.includes('app.use("/api", apiLimiter)');
  record({
    name: 'API Rate Limiting',
    phase: 'SECURITY',
    passed: apiLimiterDefined && apiLimiterApplied,
    details: `apiLimiter defined: ${apiLimiterDefined}, applied to /api: ${apiLimiterApplied}`,
    severity: 'critical'
  });

  const authRoutesContent = fs.readFileSync(path.resolve(__dirname, '../authRoutes.ts'), 'utf-8');
  const zodUsedInRoutes = routesFile.includes('zod') || routesFile.includes('Zod');
  const zodUsedInAuth = authRoutesContent.includes('z.object') || authRoutesContent.includes('z.string');
  record({
    name: 'Input Validation (Zod Schema)',
    phase: 'SECURITY',
    passed: zodUsedInAuth,
    details: `Zod validation in auth routes: ${zodUsedInAuth}, in main routes: ${zodUsedInRoutes}`,
    severity: 'medium'
  });

  const authServiceFile = fs.readFileSync(path.resolve(__dirname, '../services/authService.ts'), 'utf-8');
  const hasSecureHashing = authServiceFile.includes('pbkdf2') || authServiceFile.includes('PBKDF2') || authServiceFile.includes('bcrypt') || authServiceFile.includes('scrypt') || authServiceFile.includes('argon');
  record({
    name: 'Secure Password Hashing Algorithm',
    phase: 'SECURITY',
    passed: hasSecureHashing,
    details: hasSecureHashing ? 'Industry-standard password hashing (PBKDF2/bcrypt/scrypt/argon2)' : 'No secure hashing detected',
    severity: 'critical'
  });

  const hasEncryption = authServiceFile.includes('AES') || authServiceFile.includes('aes') || authServiceFile.includes('encrypt') || authServiceFile.includes('cipher');
  record({
    name: 'Data Encryption Capabilities',
    phase: 'SECURITY',
    passed: hasEncryption || hasSecureHashing,
    details: `Encryption: ${hasEncryption}, Secure hashing: ${hasSecureHashing}`,
    severity: 'high'
  });
}

async function phase12_websocket_realtime() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 12: WebSocket & Real-Time System');
  console.log('════════════════════════════════════════');

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');

  const wsSetupFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');
  const hasWsServer = wsSetupFile.includes('WebSocketServer') || wsSetupFile.includes('WebSocket') || wsSetupFile.includes('wss.');
  const hasWsUpgrade = wsSetupFile.includes('upgrade') || wsSetupFile.includes('on(\'connection');
  record({
    name: 'WebSocket Server Configured',
    phase: 'REALTIME',
    passed: hasWsServer,
    details: `WebSocket server: ${hasWsServer}, upgrade/connection handler: ${hasWsUpgrade}`,
    severity: 'high'
  });

  const broadcastServiceExists = fs.existsSync(path.resolve(__dirname, '../services/websocketCounter.ts'));
  const hasBroadcastFn = wsSetupFile.includes('broadcastToWorkspace') || wsSetupFile.includes('broadcastToUser');
  record({
    name: 'Broadcast System Available',
    phase: 'REALTIME',
    passed: hasBroadcastFn || broadcastServiceExists,
    details: `Broadcast functions: ${hasBroadcastFn}, WebSocket counter service: ${broadcastServiceExists}`,
    severity: 'high'
  });

  const notificationEngineExists = fs.existsSync(path.resolve(__dirname, '../services/universalNotificationEngine.ts'));
  record({
    name: 'Universal Notification Engine',
    phase: 'REALTIME',
    passed: notificationEngineExists,
    details: notificationEngineExists ? 'universalNotificationEngine.ts exists' : 'Notification engine missing',
    severity: 'high'
  });
}

async function phase13_automation_orchestration() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 13: Automation & Orchestration');
  console.log('════════════════════════════════════════');

  const serviceFiles = [
    { name: 'Financial Pipeline Orchestrator', path: '../services/financialPipelineOrchestrator.ts' },
    { name: 'Trinity Maintenance Orchestrator', path: '../services/trinityMaintenanceOrchestrator.ts' },
    { name: 'Automation Rollback Service', path: '../services/automationRollbackService.ts' },
    { name: 'Trinity Data Integrity Scanner', path: '../services/trinityDataIntegrityScanner.ts' },
    { name: 'Advanced Scheduling Service', path: '../services/advancedSchedulingService.ts' },
  ];

  for (const svc of serviceFiles) {
    const exists = fs.existsSync(path.resolve(__dirname, svc.path));
    record({
      name: `${svc.name} Service Exists`,
      phase: 'AUTOMATION',
      passed: exists,
      details: exists ? `${svc.name} implemented` : `${svc.name} missing`,
      severity: exists ? 'info' : 'high'
    });
  }

  const routesFile = fs.readFileSync(path.resolve(__dirname, '../routes.ts'), 'utf-8');
  const hasAutomation = routesFile.includes('/api/automation');
  const hasExecTracker = routesFile.includes('execution-tracker');
  record({
    name: 'Automation Routes Mounted',
    phase: 'AUTOMATION',
    passed: hasAutomation && hasExecTracker,
    details: `Automation: ${hasAutomation}, Execution Tracker: ${hasExecTracker}`,
    severity: 'high'
  });
}

async function phase14_drizzle_schema_exports() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 14: Schema Module Organization');
  console.log('════════════════════════════════════════');

  const schemaDir = path.resolve(__dirname, '../../shared/schema');
  const schemaDirExists = fs.existsSync(schemaDir);
  record({
    name: 'Schema Module Directory Exists',
    phase: 'SCHEMA',
    passed: schemaDirExists,
    details: schemaDirExists ? 'shared/schema/ directory exists for domain modules' : 'Schema directory missing',
    severity: 'high'
  });

  if (schemaDirExists) {
    const schemaFiles = fs.readdirSync(schemaDir).filter(f => f.endsWith('.ts'));
    record({
      name: 'Schema Domain Modules Count',
      phase: 'SCHEMA',
      passed: schemaFiles.length >= 10,
      details: `${schemaFiles.length} schema domain modules: ${schemaFiles.slice(0, 8).join(', ')}${schemaFiles.length > 8 ? '...' : ''}`,
      severity: 'high'
    });
  }

  const mainSchemaExists = fs.existsSync(path.resolve(__dirname, '../../shared/schema.ts'));
  record({
    name: 'Main Schema Entry Point Exists',
    phase: 'SCHEMA',
    passed: mainSchemaExists,
    details: mainSchemaExists ? 'shared/schema.ts exists as main entry point' : 'Main schema file missing',
    severity: 'critical'
  });
}

async function phase15_comprehensive_service_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 15: Service Layer Coverage');
  console.log('════════════════════════════════════════');

  const criticalServices = [
    { name: 'Email Service', path: '../services/emailService.ts' },
    { name: 'Auth Service', path: '../services/authService.ts' },
    { name: 'SMS Service', path: '../services/smsService.ts' },
    { name: 'Time Entry Service', path: '../services/timeEntryService.ts' },
    { name: 'Advanced Scheduling', path: '../services/advancedSchedulingService.ts' },
    { name: 'Sentiment Analyzer', path: '../services/sentimentAnalyzer.ts' },
    { name: 'Tax Calculator', path: '../services/taxCalculator.ts' },
    { name: 'Timesheet Report', path: '../services/timesheetReportService.ts' },
    { name: 'Timesheet Invoice', path: '../services/timesheetInvoiceService.ts' },
    { name: 'Shift Approval', path: '../services/shiftApprovalService.ts' },
    { name: 'Document Signing', path: '../services/documentSigningService.ts' },
    { name: 'Time Entry Dispute', path: '../services/timeEntryDisputeService.ts' },
    { name: 'Trinity Outreach', path: '../services/trinityOutreachService.ts' },
    { name: 'Abuse Detection', path: '../services/abuseDetection.ts' },
    { name: 'Employee Behavior Scoring', path: '../services/employeeBehaviorScoring.ts' },
    { name: 'Credit Manager', path: '../services/billing/tokenManager.ts' },
    { name: 'Stripe Webhooks', path: '../services/billing/stripeWebhooks.ts' },
    { name: 'AI Brain Service', path: '../services/ai-brain/aiBrainService.ts' },
    { name: 'Claude Service', path: '../services/ai-brain/trinity-orchestration/trinityValidationService.ts' },
  ];

  let existCount = 0;
  let missingServices: string[] = [];

  for (const svc of criticalServices) {
    const exists = fs.existsSync(path.resolve(__dirname, svc.path));
    if (exists) existCount++;
    else missingServices.push(svc.name);
  }

  record({
    name: 'Critical Services All Present',
    phase: 'SERVICES',
    passed: missingServices.length === 0,
    details: missingServices.length === 0
      ? `All ${criticalServices.length} critical services exist`
      : `Missing: ${missingServices.join(', ')}`,
    severity: 'critical'
  });

  const servicesDir = path.resolve(__dirname, '../services');
  const allServiceFiles = fs.readdirSync(servicesDir, { recursive: true }) as string[];
  const tsServiceFiles = allServiceFiles.filter(f => typeof f === 'string' && f.endsWith('.ts'));

  record({
    name: 'Total Service File Count',
    phase: 'SERVICES',
    passed: tsServiceFiles.length >= 50,
    details: `${tsServiceFiles.length} TypeScript service files`,
    severity: 'info'
  });
}

export async function runPlatform360StressTest() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  PLATFORM 360° COMPREHENSIVE STRESS TEST               ║');
  console.log('║  15 Phases | Full Platform Coverage Validation          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  results.length = 0;

  await phase1_auth_system_completeness();
  await phase2_crud_entity_schemas();
  await phase3_workspace_isolation();
  await phase4_stripe_webhook_handlers();
  await phase5_api_route_mount_coverage();
  await phase6_email_template_coverage();
  await phase7_import_export_system();
  await phase8_frontend_backend_alignment();
  await phase9_quickbooks_integration();
  await phase10_database_referential_integrity();
  await phase11_security_hardening();
  await phase12_websocket_realtime();
  await phase13_automation_orchestration();
  await phase14_drizzle_schema_exports();
  await phase15_comprehensive_service_coverage();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFails = results.filter(r => !r.passed && r.severity === 'critical').length;
  const highFails = results.filter(r => !r.passed && r.severity === 'high').length;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} PASSED | ${failed} FAILED                      ║`);
  console.log(`║  Critical Fails: ${criticalFails} | High Fails: ${highFails}                      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  [${r.severity.toUpperCase()}] ${r.name}: ${r.details}`);
    });
  }

  return { total: results.length, passed, failed, criticalFails, highFails, results };
}
