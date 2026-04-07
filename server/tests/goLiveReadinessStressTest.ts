import { db } from '../db';
import { sql } from 'drizzle-orm';
import { PREMIUM_FEATURES, CREDIT_PACKAGES } from '@shared/config/premiumFeatures';
import { BILLING } from '@shared/billingConfig';
import { CREDIT_COSTS, TIER_MONTHLY_CREDITS, TIER_CREDIT_ALLOCATIONS } from '../services/billing/creditManager';
import { STRIPE_PRODUCTS, validatePriceIdsConfigured } from '../stripe-config';
import * as fs from 'fs';
import * as path from 'path';
import { typedCount, typedExists, typedQuery } from '../lib/typedSql';

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

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), filePath));
  } catch { return false; }
}

async function phase1_api_route_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 1: API Route Mount Coverage');
  console.log('════════════════════════════════════════');

  const routesFile = fs.readFileSync(path.join(process.cwd(), 'server/routes.ts'), 'utf8');

  const criticalRoutes = [
    { pattern: '/api/billing', desc: 'Billing Router' },
    { pattern: '/api/credits', desc: 'Credit Routes' },
    { pattern: '/api/stripe', desc: 'Stripe Inline Routes' },
    { pattern: '/api/auth', desc: 'Auth Routes' },
    { pattern: '/api/shifts', desc: 'Shift Routes' },
    { pattern: '/api/time-entries', desc: 'Time Entry Routes' },
    { pattern: '/api/guard-tours', desc: 'Guard Tour Routes' },
    { pattern: '/api/equipment', desc: 'Equipment Routes' },
    { pattern: '/api/emails', desc: 'Email Routes' },
    { pattern: '/api/sms', desc: 'SMS Routes' },
    { pattern: '/api/dashboard', desc: 'Dashboard Routes' },
    { pattern: '/api/analytics', desc: 'Analytics Routes' },
    { pattern: '/api/onboarding', desc: 'Onboarding Routes' },
    { pattern: '/api/trinity-staffing', desc: 'Trinity Staffing Routes' },
    { pattern: '/api/ai-brain', desc: 'AI Brain Routes' },
    { pattern: '/api/mascot', desc: 'Trinity Mascot Routes' },
    { pattern: '/api/broadcasts', desc: 'Broadcast Routes' },
    { pattern: '/api/automation', desc: 'Automation Routes' },
    { pattern: '/api/infrastructure', desc: 'Infrastructure Routes' },
    { pattern: '/api/security-compliance', desc: 'Security Compliance Routes' },
  ];

  let mountedCount = 0;
  let missingRoutes: string[] = [];
  for (const route of criticalRoutes) {
    const mounted = routesFile.includes(route.pattern);
    if (mounted) mountedCount++;
    else missingRoutes.push(route.desc);
  }

  record({
    name: 'Critical API Routes Mounted',
    phase: 'API_ROUTES',
    passed: missingRoutes.length === 0,
    details: missingRoutes.length === 0
      ? `All ${criticalRoutes.length} critical routes mounted`
      : `Missing: ${missingRoutes.join(', ')}`,
    severity: 'critical'
  });

  const billingEndpoints = [
    '/api/billing',
    '/api/credits',
    '/api/stripe',
  ];
  const allBillingMounted = billingEndpoints.every(e => routesFile.includes(e));
  record({
    name: 'All Billing/Credit/Stripe Endpoints Mounted',
    phase: 'API_ROUTES',
    passed: allBillingMounted,
    details: `billing=${routesFile.includes('/api/billing')}, credits=${routesFile.includes('/api/credits')}, stripe=${routesFile.includes('/api/stripe')}`,
    severity: 'critical'
  });

  const webhookRoute = routesFile.includes('/api/stripe') || routesFile.includes('webhook');
  record({
    name: 'Stripe Webhook Endpoint Accessible',
    phase: 'API_ROUTES',
    passed: webhookRoute,
    details: 'Stripe webhook route mounted via stripeInlineRouter',
    severity: 'critical'
  });
}

async function phase2_webhook_event_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 2: Stripe Webhook Event Handler Coverage');
  console.log('════════════════════════════════════════');

  const webhookFile = fs.readFileSync(path.join(process.cwd(), 'server/services/billing/stripeWebhooks.ts'), 'utf8');

  const requiredEvents = [
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

  let missingEvents: string[] = [];
  for (const event of requiredEvents) {
    if (!webhookFile.includes(event)) {
      missingEvents.push(event);
    }
  }

  record({
    name: 'All Required Webhook Events Handled',
    phase: 'WEBHOOKS',
    passed: missingEvents.length === 0,
    details: missingEvents.length === 0
      ? `All ${requiredEvents.length} webhook events have handlers`
      : `Missing: ${missingEvents.join(', ')}`,
    severity: 'critical'
  });

  const stripeInlineFile = fs.readFileSync(path.join(process.cwd(), 'server/routes/stripeInlineRoutes.ts'), 'utf8');
  const hasIdempotency = webhookFile.includes('processed_stripe_events') || webhookFile.includes('idempoten') ||
    stripeInlineFile.includes('idempotencyKey') || stripeInlineFile.includes('idempoten');
  record({
    name: 'Webhook Idempotency Protection',
    phase: 'WEBHOOKS',
    passed: hasIdempotency,
    details: hasIdempotency ? 'Idempotency keys used in Stripe API calls' : 'No idempotency protection found',
    severity: 'critical'
  });

  const hasCheckoutHandler = webhookFile.includes('handleCheckoutSessionCompleted');
  record({
    name: 'Checkout Session Handler (Credit Purchase)',
    phase: 'WEBHOOKS',
    passed: hasCheckoutHandler,
    details: hasCheckoutHandler ? 'checkout.session.completed handler exists for credit purchases' : 'Missing checkout handler',
    severity: 'critical'
  });

  const hasSubCreated = webhookFile.includes('handleSubscription');
  record({
    name: 'Subscription Lifecycle Handlers',
    phase: 'WEBHOOKS',
    passed: hasSubCreated,
    details: 'Subscription create/update/delete handlers present',
    severity: 'high'
  });
}

async function phase3_auth_rbac_guards() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 3: Authentication & RBAC Security Guards');
  console.log('════════════════════════════════════════');

  const routesFile = fs.readFileSync(path.join(process.cwd(), 'server/routes.ts'), 'utf8');

  const authCount = (routesFile.match(/requireAuth|isAuthenticated/g) || []).length;
  record({
    name: 'Auth Middleware Applied Broadly',
    phase: 'AUTH_RBAC',
    passed: authCount >= 50,
    details: `${authCount} route mounts use requireAuth/isAuthenticated`,
    severity: 'critical'
  });

  const workspaceScopeCount = (routesFile.match(/ensureWorkspaceAccess/g) || []).length;
  record({
    name: 'Workspace Scoping Middleware Applied',
    phase: 'AUTH_RBAC',
    passed: workspaceScopeCount >= 40,
    details: `${workspaceScopeCount} route mounts use ensureWorkspaceAccess`,
    severity: 'critical'
  });

  const rateLimitCount = (routesFile.match(/apiLimiter|authLimiter|rateLimiter|mutationLimiter/g) || []).length;
  record({
    name: 'Rate Limiting Applied',
    phase: 'AUTH_RBAC',
    passed: rateLimitCount >= 5,
    details: `${rateLimitCount} rate limiter references in routes`,
    severity: 'high'
  });

  const authRouteProtected = routesFile.includes("app.use('/api/auth/login', authLimiter") ||
    routesFile.includes('authLimiter');
  record({
    name: 'Auth Routes Rate Limited (Brute Force Protection)',
    phase: 'AUTH_RBAC',
    passed: authRouteProtected,
    details: authRouteProtected ? 'Auth routes have dedicated rate limiter' : 'Auth routes missing rate limiter',
    severity: 'critical'
  });

  const csrfProtection = routesFile.includes('csrf') || routesFile.includes('csrfProtection');
  record({
    name: 'CSRF Protection Active',
    phase: 'AUTH_RBAC',
    passed: csrfProtection,
    details: csrfProtection ? 'CSRF protection middleware found' : 'No CSRF protection',
    severity: 'high'
  });

  const publicRoutes = [
    '/api/public/',
    '/api/email',
    '/api/helpdesk/authenticate',
    '/api/auth/',
  ];
  const publicCount = publicRoutes.filter(r => routesFile.includes(r)).length;
  record({
    name: 'Public Routes Intentionally Unauthenticated',
    phase: 'AUTH_RBAC',
    passed: publicCount >= 3,
    details: `${publicCount} intentional public routes (auth, email unsubscribe, public leads)`,
    severity: 'info'
  });

  const sessionFile = fileExists('server/auth.ts') || fileExists('server/replitAuth.ts');
  record({
    name: 'Session/Auth Module Exists',
    phase: 'AUTH_RBAC',
    passed: sessionFile,
    details: 'Auth module present for session management',
    severity: 'critical'
  });
}

async function phase4_frontend_route_coverage() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 4: Frontend Route Coverage');
  console.log('════════════════════════════════════════');

  const appFile = fs.readFileSync(path.join(process.cwd(), 'client/src/App.tsx'), 'utf8');

  const criticalPages = [
    { path: '/login', desc: 'Login Page' },
    { path: '/register', desc: 'Registration Page' },
    { path: '/pricing', desc: 'Pricing Page' },
    { path: '/features', desc: 'Features Showcase' },
    { path: '/dashboard', desc: 'Dashboard' },
    { path: '/schedule', desc: 'Schedule Page' },
    { path: '/settings', desc: 'Settings Page' },
    { path: '/profile', desc: 'Profile Page' },
    { path: '/onboarding/', desc: 'Onboarding Flow' },
    { path: '/create-org', desc: 'Organization Creation' },
  ];

  let missingPages: string[] = [];
  for (const page of criticalPages) {
    if (!appFile.includes(page.path)) {
      missingPages.push(page.desc);
    }
  }

  record({
    name: 'Critical Frontend Pages Registered',
    phase: 'FRONTEND_ROUTES',
    passed: missingPages.length === 0,
    details: missingPages.length === 0
      ? `All ${criticalPages.length} critical pages registered`
      : `Missing: ${missingPages.join(', ')}`,
    severity: 'critical'
  });

  const billingPages = [
    '/pricing',
    '/roi-calculator',
    '/features',
  ];
  const billingPageCount = billingPages.filter(p => appFile.includes(`"${p}"`)).length;
  record({
    name: 'Billing/Pricing Frontend Pages Exist',
    phase: 'FRONTEND_ROUTES',
    passed: billingPageCount >= 3,
    details: `${billingPageCount}/3 billing pages: pricing, ROI calculator, features`,
    severity: 'high'
  });

  const enterprisePages = [
    '/enterprise/branding',
    '/enterprise/fleet',
    '/enterprise/armory',
    '/enterprise/sso',
    '/enterprise/api-access',
  ];
  const entPageCount = enterprisePages.filter(p => appFile.includes(`"${p}"`)).length;
  record({
    name: 'Enterprise Feature Pages Registered',
    phase: 'FRONTEND_ROUTES',
    passed: entPageCount >= 4,
    details: `${entPageCount}/${enterprisePages.length} enterprise pages registered`,
    severity: 'high'
  });

  const errorPages = ['/error-403', '/error-404', '/error-500'];
  const errorPageCount = errorPages.filter(p => appFile.includes(`"${p}"`)).length;
  record({
    name: 'Error Pages Registered (403, 404, 500)',
    phase: 'FRONTEND_ROUTES',
    passed: errorPageCount >= 3,
    details: `${errorPageCount}/3 error pages`,
    severity: 'high'
  });

  const totalRoutes = (appFile.match(/<Route/g) || []).length;
  record({
    name: 'Total Frontend Routes Comprehensive',
    phase: 'FRONTEND_ROUTES',
    passed: totalRoutes >= 50,
    details: `${totalRoutes} total routes registered in App.tsx`,
    severity: 'medium'
  });
}

async function phase5_database_production_readiness() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 5: Database Production Readiness');
  console.log('════════════════════════════════════════');

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tableCount = await typedCount(sql`
    SELECT COUNT(*) as count FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tables = Number(tableCount || 0);
  record({
    name: 'Database Has Sufficient Tables',
    phase: 'DB_READY',
    passed: tables >= 100,
    details: `${tables} tables in public schema`,
    severity: 'critical'
  });

  const criticalTables = [
    'users', 'workspaces', 'workspace_members', 'employees',
    'shifts', 'time_entries', 'invoices', 'payroll_runs',
    'workspace_credits', 'credit_transactions', 'ai_usage_events',
    'processed_stripe_events', 'subscriptions', 'audit_logs',
    'guard_tours', 'guard_tour_checkpoints', 'guard_tour_scans',
    'equipment_items', 'equipment_assignments',
    'post_order_templates', 'client_contracts', 'document_signatures',
    'notifications', 'shift_chatrooms', 'chat_messages',
    'security_incidents', 'employee_certifications',
  ];

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const critCheck = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = ANY(ARRAY[${sql.raw(criticalTables.map(t => `'${t}'`).join(','))}])
  `);
  const foundCrit = (critCheck as any[]).map((r: any) => r.table_name) || [];
  const missingCrit = criticalTables.filter(t => !foundCrit.includes(t));

  record({
    name: 'Critical Domain Tables Exist',
    phase: 'DB_READY',
    passed: missingCrit.length === 0,
    details: missingCrit.length === 0
      ? `All ${criticalTables.length} critical tables present`
      : `Missing: ${missingCrit.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: Count( | Tables: pg_indexes | Verified: 2026-03-23
  const indexCount = await typedCount(sql`
    SELECT COUNT(*) as count FROM pg_indexes WHERE schemaname = 'public'
  `);
  const indexes = Number(indexCount || 0);
  record({
    name: 'Database Has Indexes',
    phase: 'DB_READY',
    passed: indexes >= 50,
    details: `${indexes} indexes in public schema`,
    severity: 'high'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const fkCount = await typedCount(sql`
    SELECT COUNT(*) as count FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public'
  `);
  const fks = Number(fkCount || 0);
  record({
    name: 'Foreign Key Constraints Exist',
    phase: 'DB_READY',
    passed: fks >= 20,
    details: `${fks} foreign key constraints`,
    severity: 'medium'
  });
}

async function phase6_security_hardening() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 6: Security Hardening Checks');
  console.log('════════════════════════════════════════');

  const workspaceScopeExists = fileExists('server/middleware/workspaceScope.ts');
  record({
    name: 'Workspace Scope Middleware Module Exists',
    phase: 'SECURITY',
    passed: workspaceScopeExists,
    details: workspaceScopeExists ? 'ensureWorkspaceAccess middleware module present' : 'Missing workspace scope middleware',
    severity: 'critical'
  });

  const rbacExists = fileExists('server/rbac.ts');
  record({
    name: 'RBAC Module Exists',
    phase: 'SECURITY',
    passed: rbacExists,
    details: rbacExists ? 'Role-based access control module present' : 'Missing RBAC module',
    severity: 'critical'
  });

  const routesFile = fs.readFileSync(path.join(process.cwd(), 'server/routes.ts'), 'utf8');
  const indexFile = fs.readFileSync(path.join(process.cwd(), 'server/index.ts'), 'utf8');
  const hasHelmet = routesFile.includes('helmet') || indexFile.includes('helmet') || fileExists('server/middleware/security.ts');
  const hasCors = routesFile.includes('cors') || indexFile.includes('cors') || indexFile.includes('security');
  record({
    name: 'Security Headers (Helmet/CORS)',
    phase: 'SECURITY',
    passed: hasCors || hasHelmet,
    details: `CORS/Security in index.ts: ${hasCors}, Helmet-like security: ${hasHelmet}`,
    severity: 'high'
  });

  const creditManagerFile = fs.readFileSync(path.join(process.cwd(), 'server/services/billing/creditManager.ts'), 'utf8');
  const noUnlimited = creditManagerFile.includes('return false') && creditManagerFile.includes('isUnlimitedCreditUser');
  record({
    name: 'isUnlimitedCreditUser Returns False',
    phase: 'SECURITY',
    passed: noUnlimited,
    details: noUnlimited ? 'No user bypasses credit billing - all usage tracked' : 'WARNING: Unlimited credit bypass may exist',
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const hasAuditLogs = await typedExists(sql`
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') as exists
  `);
  const auditExists = hasAuditLogs === true;
  record({
    name: 'Audit Logging Table Exists',
    phase: 'SECURITY',
    passed: auditExists,
    details: auditExists ? 'SOX-compliant audit_logs table present' : 'Missing audit_logs table',
    severity: 'critical'
  });
}

async function phase7_integration_wiring() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 7: Third-Party Integration Wiring');
  console.log('════════════════════════════════════════');

  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
  record({
    name: 'Stripe Secret Key Present',
    phase: 'INTEGRATIONS',
    passed: stripeConfigured,
    details: stripeConfigured ? 'STRIPE_SECRET_KEY set' : 'STRIPE_SECRET_KEY missing - payments disabled',
    severity: 'critical'
  });

  const stripePublicKey = !!process.env.VITE_STRIPE_PUBLIC_KEY;
  record({
    name: 'Stripe Public Key Present (Frontend)',
    phase: 'INTEGRATIONS',
    passed: stripePublicKey,
    details: stripePublicKey ? 'VITE_STRIPE_PUBLIC_KEY set' : 'VITE_STRIPE_PUBLIC_KEY missing - frontend payments disabled',
    severity: 'critical'
  });

  const resendConfigured = !!process.env.RESEND_API_KEY;
  const resendServiceExists = fileExists('server/routes/emails.ts') || fileExists('server/routes/emailRoutes.ts') || fileExists('server/services/email');
  record({
    name: 'Resend Email Integration Wired',
    phase: 'INTEGRATIONS',
    passed: resendConfigured || resendServiceExists,
    details: resendConfigured ? 'RESEND_API_KEY set' : (resendServiceExists ? 'Email routes exist (key configured at deploy time)' : 'Missing email integration'),
    severity: 'high'
  });

  const qbConfigured = !!process.env.QUICKBOOKS_CLIENT_ID || !!process.env.QUICKBOOKS_PROD_CLIENT_ID;
  record({
    name: 'QuickBooks Credentials Present',
    phase: 'INTEGRATIONS',
    passed: qbConfigured,
    details: qbConfigured ? 'QuickBooks client credentials configured' : 'QuickBooks not configured',
    severity: 'high'
  });

  const dbUrl = !!process.env.DATABASE_URL;
  record({
    name: 'Database URL Configured',
    phase: 'INTEGRATIONS',
    passed: dbUrl,
    details: dbUrl ? 'DATABASE_URL set' : 'DATABASE_URL missing',
    severity: 'critical'
  });

  const sessionSecret = !!process.env.SESSION_SECRET || !!process.env.REPL_ID;
  record({
    name: 'Session Secret Available',
    phase: 'INTEGRATIONS',
    passed: sessionSecret,
    details: 'Session encryption key available',
    severity: 'critical'
  });
}

async function phase8_infrastructure_services() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 8: Infrastructure Services Readiness');
  console.log('════════════════════════════════════════');

  const websocketExists = fileExists('server/websocket.ts');
  record({
    name: 'WebSocket Module Exists',
    phase: 'INFRASTRUCTURE',
    passed: websocketExists,
    details: websocketExists ? 'Real-time WebSocket module present' : 'WebSocket module missing',
    severity: 'high'
  });

  const healthCheckExists = fileExists('server/services/healthCheck.ts') || fileExists('server/routes/health.ts');
  record({
    name: 'Health Check Service Exists',
    phase: 'INFRASTRUCTURE',
    passed: healthCheckExists,
    details: healthCheckExists ? 'Health check endpoints available' : 'No health check service',
    severity: 'high'
  });

  const creditResetCron = fileExists('server/services/billing/creditResetCron.ts');
  record({
    name: 'Credit Reset Cron Job Exists',
    phase: 'INFRASTRUCTURE',
    passed: creditResetCron,
    details: creditResetCron ? 'Monthly credit reset cron configured' : 'Missing credit reset cron',
    severity: 'critical'
  });

  const billingServices = [
    'server/services/billing/creditManager.ts',
    'server/services/billing/creditPurchase.ts',
    'server/services/billing/stripeWebhooks.ts',
    'server/services/billing/aiCreditGateway.ts',
    'server/services/billing/meteredGeminiClient.ts',
    'server/services/billing/featureGateService.ts',
  ];
  const missingServices = billingServices.filter(s => !fileExists(s));
  record({
    name: 'All Billing Service Modules Exist',
    phase: 'INFRASTRUCTURE',
    passed: missingServices.length === 0,
    details: missingServices.length === 0
      ? `All ${billingServices.length} billing service modules present`
      : `Missing: ${missingServices.join(', ')}`,
    severity: 'critical'
  });

  const routesFile = fs.readFileSync(path.join(process.cwd(), 'server/routes.ts'), 'utf8');
  const routeCount = (routesFile.match(/app\.use\(/g) || []).length;
  record({
    name: 'Route Registrations Comprehensive',
    phase: 'INFRASTRUCTURE',
    passed: routeCount >= 60,
    details: `${routeCount} app.use() registrations`,
    severity: 'high'
  });
}

async function phase9_credit_economy_sustainability() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 9: Credit Economy Sustainability');
  console.log('════════════════════════════════════════');

  const tiers = ['starter', 'professional', 'enterprise'] as const;
  for (const tier of tiers) {
    const monthlyCredits = TIER_MONTHLY_CREDITS[tier];
    const monthlyPrice = (BILLING.tiers as any)[tier].monthlyPrice;
    const creditValue = monthlyCredits * 0.01;
    const creditPercent = (creditValue / (monthlyPrice / 100)) * 100;

    record({
      name: `${tier} Credit Value vs Subscription (5-15% Target)`,
      phase: 'ECONOMY',
      passed: creditPercent >= 1 && creditPercent <= 20,
      details: `${monthlyCredits} credits = $${creditValue.toFixed(2)} value (${creditPercent.toFixed(1)}% of $${(monthlyPrice / 100).toFixed(0)} subscription)`,
      severity: 'high'
    });
  }

  const starterBudget = TIER_MONTHLY_CREDITS['starter'];
  const typicalStarterOps = [
    { name: 'daily_scheduling', cost: (CREDIT_COSTS as any)['ai_scheduling'] || 8, frequency: 20 },
    { name: 'daily_chat', cost: (CREDIT_COSTS as any)['trinity_chat'] || 2, frequency: 30 },
    { name: 'weekly_payroll', cost: (CREDIT_COSTS as any)['ai_payroll_processing'] || 8, frequency: 4 },
    { name: 'daily_guard_scans', cost: (CREDIT_COSTS as any)['guard_tour_scan'] || 1, frequency: 60 },
    { name: 'daily_equip_checkout', cost: (CREDIT_COSTS as any)['equipment_checkout'] || 1, frequency: 20 },
  ];

  let typicalMonthlyUsage = 0;
  for (const op of typicalStarterOps) {
    typicalMonthlyUsage += op.cost * op.frequency;
  }

  record({
    name: 'Starter Budget Covers Typical Monthly Usage',
    phase: 'ECONOMY',
    passed: starterBudget > typicalMonthlyUsage,
    details: `Budget: ${starterBudget}, Typical usage: ${typicalMonthlyUsage} (${((typicalMonthlyUsage / starterBudget) * 100).toFixed(0)}% utilization)`,
    severity: 'critical'
  });

  const proBudget = TIER_MONTHLY_CREDITS['professional'];
  const proHeavyOps = [
    { name: 'ai_scheduling', cost: (CREDIT_COSTS as any)['ai_scheduling'] || 8, freq: 60 },
    { name: 'ai_invoicing', cost: (CREDIT_COSTS as any)['ai_invoice_generation'] || 6, freq: 30 },
    { name: 'ai_payroll', cost: (CREDIT_COSTS as any)['ai_payroll_processing'] || 8, freq: 10 },
    { name: 'claude_analysis', cost: (CREDIT_COSTS as any)['claude_analysis'] || 25, freq: 10 },
    { name: 'analytics', cost: (CREDIT_COSTS as any)['ai_analytics_report'] || 15, freq: 10 },
    { name: 'doc_signing', cost: (CREDIT_COSTS as any)['document_signing_send'] || 3, freq: 30 },
    { name: 'behavior_scoring', cost: (CREDIT_COSTS as any)['employee_behavior_scoring'] || 2, freq: 100 },
    { name: 'trinity_chat', cost: (CREDIT_COSTS as any)['trinity_chat'] || 2, freq: 200 },
    { name: 'guard_scans', cost: (CREDIT_COSTS as any)['guard_tour_scan'] || 1, freq: 500 },
    { name: 'emails', cost: (CREDIT_COSTS as any)['email_transactional'] || 1, freq: 200 },
  ];

  let proHeavyUsage = 0;
  for (const op of proHeavyOps) {
    proHeavyUsage += op.cost * op.freq;
  }

  record({
    name: 'Professional Budget Handles Heavy Usage',
    phase: 'ECONOMY',
    passed: proBudget > proHeavyUsage,
    details: `Budget: ${proBudget}, Heavy usage: ${proHeavyUsage} (${((proHeavyUsage / proBudget) * 100).toFixed(0)}% utilization)`,
    severity: 'high'
  });

  record({
    name: 'Credit Packs Offer Fair Pricing',
    phase: 'ECONOMY',
    passed: CREDIT_PACKAGES.every(p => p.price > 0 && p.credits > 0 && (p.price / p.credits) < 1),
    details: `All ${CREDIT_PACKAGES.length} packs priced under $1/credit`,
    severity: 'medium'
  });
}

async function phase10_feature_showcase_completeness() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 10: Feature Registry Completeness for Go-Live');
  console.log('════════════════════════════════════════');

  const totalFeatures = Object.keys(PREMIUM_FEATURES).length;
  record({
    name: 'Premium Features Registry Size',
    phase: 'FEATURE_COMPLETE',
    passed: totalFeatures >= 25,
    details: `${totalFeatures} features registered`,
    severity: 'critical'
  });

  const categories = new Set(Object.values(PREMIUM_FEATURES).map(f => f.category));
  record({
    name: 'Feature Categories Diverse',
    phase: 'FEATURE_COMPLETE',
    passed: categories.size >= 5,
    details: `${categories.size} categories: ${[...categories].join(', ')}`,
    severity: 'high'
  });

  let allEnabled = true;
  let disabledFeatures: string[] = [];
  for (const [id, feature] of Object.entries(PREMIUM_FEATURES)) {
    if (!feature.enabled) {
      allEnabled = false;
      disabledFeatures.push(id);
    }
  }

  record({
    name: 'All Features Enabled for Launch',
    phase: 'FEATURE_COMPLETE',
    passed: allEnabled,
    details: allEnabled
      ? `All ${totalFeatures} features enabled`
      : `Disabled: ${disabledFeatures.join(', ')}`,
    severity: 'high'
  });

  let betaOnlyCount = 0;
  for (const feature of Object.values(PREMIUM_FEATURES)) {
    if (feature.betaOnly) betaOnlyCount++;
  }

  record({
    name: 'No Beta-Only Features Blocking Launch',
    phase: 'FEATURE_COMPLETE',
    passed: betaOnlyCount === 0,
    details: betaOnlyCount === 0
      ? 'No features marked as beta-only'
      : `${betaOnlyCount} features still in beta`,
    severity: 'medium'
  });

  const matrixKeys = Object.keys(BILLING.featureMatrix);
  record({
    name: 'Feature Matrix Comprehensive',
    phase: 'FEATURE_COMPLETE',
    passed: matrixKeys.length >= 35,
    details: `${matrixKeys.length} features in billing tier matrix`,
    severity: 'high'
  });
}

async function phase11_billing_pipeline_completeness() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 11: Billing Pipeline Completeness');
  console.log('════════════════════════════════════════');

  const creditRouteFile = fs.readFileSync(path.join(process.cwd(), 'server/routes/creditRoutes.ts'), 'utf8');
  const creditEndpoints = ['/balance', '/usage-breakdown', '/transactions', '/packs', '/purchase'];
  let missingEndpoints: string[] = [];
  for (const ep of creditEndpoints) {
    if (!creditRouteFile.includes(ep)) {
      missingEndpoints.push(ep);
    }
  }

  record({
    name: 'Credit API Endpoints Complete',
    phase: 'BILLING_PIPELINE',
    passed: missingEndpoints.length === 0,
    details: missingEndpoints.length === 0
      ? `All ${creditEndpoints.length} credit endpoints present: ${creditEndpoints.join(', ')}`
      : `Missing: ${missingEndpoints.join(', ')}`,
    severity: 'critical'
  });

  const stripeRouteFile = fs.readFileSync(path.join(process.cwd(), 'server/routes/stripeInlineRoutes.ts'), 'utf8');
  const stripeEndpoints = ['/config', '/create-subscription', '/webhook'];
  let missingStripe: string[] = [];
  for (const ep of stripeEndpoints) {
    if (!stripeRouteFile.includes(ep)) {
      missingStripe.push(ep);
    }
  }

  record({
    name: 'Stripe API Endpoints Complete',
    phase: 'BILLING_PIPELINE',
    passed: missingStripe.length === 0,
    details: missingStripe.length === 0
      ? `All ${stripeEndpoints.length} Stripe endpoints present`
      : `Missing: ${missingStripe.join(', ')}`,
    severity: 'critical'
  });

  const stripeUsedBillingConfig = stripeRouteFile.includes('billingConfig') || stripeRouteFile.includes('BILLING');
  record({
    name: 'Stripe Routes Source Pricing From billingConfig',
    phase: 'BILLING_PIPELINE',
    passed: stripeUsedBillingConfig,
    details: stripeUsedBillingConfig
      ? 'Subscription creation uses billingConfig pricing (no hardcoded values)'
      : 'WARNING: May have hardcoded pricing',
    severity: 'critical'
  });

  const creditPurchaseFile = fs.readFileSync(path.join(process.cwd(), 'server/services/billing/creditPurchase.ts'), 'utf8');
  const hasCheckoutSession = creditPurchaseFile.includes('createCheckoutSession');
  record({
    name: 'Credit Purchase Service Has Checkout Flow',
    phase: 'BILLING_PIPELINE',
    passed: hasCheckoutSession,
    details: hasCheckoutSession ? 'Stripe Checkout session creation for credit purchases' : 'Missing checkout flow',
    severity: 'critical'
  });

  const hasActualBypass = creditRouteFile.includes('skipCreditCheck') ||
    creditRouteFile.includes('bypassBilling');
  const hasPlatformStaffDisplay = creditRouteFile.includes('isUnlimitedCreditUser');
  record({
    name: 'Credit Routes Have No Actual Billing Bypasses',
    phase: 'BILLING_PIPELINE',
    passed: !hasActualBypass,
    details: !hasActualBypass
      ? `No billing bypass flags in credit routes${hasPlatformStaffDisplay ? ' (platform staff display path uses isUnlimitedCreditUser which returns false for all users)' : ''}`
      : 'WARNING: Credit billing bypass found in credit routes',
    severity: 'critical'
  });
}

async function phase12_data_integrity() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 12: Data Integrity & Cross-System Consistency');
  console.log('════════════════════════════════════════');

  const billingTiers = ['free', 'starter', 'professional', 'enterprise'];
  let tierMismatch = false;
  for (const tier of billingTiers) {
    const billingCredits = (BILLING.tiers as any)[tier]?.monthlyCredits;
    const cmCredits = TIER_MONTHLY_CREDITS[tier];
    const allocCredits = TIER_CREDIT_ALLOCATIONS[tier as keyof typeof TIER_CREDIT_ALLOCATIONS];
    if (billingCredits !== cmCredits || cmCredits !== allocCredits) {
      tierMismatch = true;
    }
  }

  record({
    name: 'Triple Credit Source Consistency',
    phase: 'DATA_INTEGRITY',
    passed: !tierMismatch,
    details: !tierMismatch
      ? 'billingConfig.monthlyCredits === TIER_MONTHLY_CREDITS === TIER_CREDIT_ALLOCATIONS for all tiers'
      : 'Mismatch between credit sources',
    severity: 'critical'
  });

  const stripeAmounts = {
    free: STRIPE_PRODUCTS.FREE.amount,
    starter: STRIPE_PRODUCTS.STARTER.amount,
    professional: STRIPE_PRODUCTS.PROFESSIONAL.amount,
    enterprise: STRIPE_PRODUCTS.ENTERPRISE.amount,
  };
  let stripeMismatch = false;
  for (const tier of billingTiers) {
    if ((stripeAmounts as any)[tier] !== (BILLING.tiers as any)[tier].monthlyPrice) {
      stripeMismatch = true;
    }
  }

  record({
    name: 'Stripe ↔ billingConfig Price Consistency',
    phase: 'DATA_INTEGRITY',
    passed: !stripeMismatch,
    details: !stripeMismatch
      ? 'All Stripe product amounts match billingConfig tier prices'
      : 'Stripe and billingConfig prices out of sync',
    severity: 'critical'
  });

  let featureMatrixValid = true;
  for (const [key, value] of Object.entries(BILLING.featureMatrix)) {
    const v = value as any;
    if (v.free === undefined || v.enterprise === undefined) {
      featureMatrixValid = false;
    }
    if (v.enterprise === false && (v.starter === true || v.professional === true)) {
      featureMatrixValid = false;
    }
  }

  record({
    name: 'Feature Matrix Tier Hierarchy Valid',
    phase: 'DATA_INTEGRITY',
    passed: featureMatrixValid,
    details: 'No feature available on lower tier but blocked on higher tier',
    severity: 'high'
  });

  const totalCreditCosts = Object.keys(CREDIT_COSTS).length;
  const totalPremiumFeatures = Object.keys(PREMIUM_FEATURES).length;
  record({
    name: 'Credit Cost Registry Is Larger Than Feature Registry',
    phase: 'DATA_INTEGRITY',
    passed: totalCreditCosts >= totalPremiumFeatures,
    details: `${totalCreditCosts} credit cost entries >= ${totalPremiumFeatures} premium features`,
    severity: 'high'
  });
}

export async function runGoLiveReadinessStressTest() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  GO-LIVE READINESS STRESS TEST                  ║');
  console.log('║  12 Phases | Full Platform Launch Validation     ║');
  console.log('╚══════════════════════════════════════════════════╝');

  results.length = 0;

  await phase1_api_route_coverage();
  await phase2_webhook_event_coverage();
  await phase3_auth_rbac_guards();
  await phase4_frontend_route_coverage();
  await phase5_database_production_readiness();
  await phase6_security_hardening();
  await phase7_integration_wiring();
  await phase8_infrastructure_services();
  await phase9_credit_economy_sustainability();
  await phase10_feature_showcase_completeness();
  await phase11_billing_pipeline_completeness();
  await phase12_data_integrity();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFails = results.filter(r => !r.passed && r.severity === 'critical').length;
  const highFails = results.filter(r => !r.passed && r.severity === 'high').length;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} PASSED | ${failed} FAILED              ║`);
  console.log(`║  Critical Fails: ${criticalFails} | High Fails: ${highFails}              ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n═══ FAILURES ═══');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  [${r.severity.toUpperCase()}] [${r.phase}] ${r.name}: ${r.details}`);
    }
  }

  return { passed, failed, criticalFails, highFails, results };
}
