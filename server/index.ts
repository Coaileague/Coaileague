// ── GCS credential bootstrap ──────────────────────────────────────────────────
// If the service account JSON is stored as GCS_KEY_JSON env var (Railway secret),
// write it to a temp file and set GOOGLE_APPLICATION_CREDENTIALS before any
// GCS client initializes.
import { writeFileSync } from 'fs';
import { join as pathJoin } from 'path';
if (process.env.GCS_KEY_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const _fs = { writeFileSync };
  const _path = { join: pathJoin };
  const _keyPath = _path.join('/tmp', 'gcs-service-account.json');
  try {
    _fs.writeFileSync(_keyPath, process.env.GCS_KEY_JSON, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = _keyPath;
    console.log('[GCS] Credentials written from GCS_KEY_JSON env var');
  } catch (e) {
    console.error('[GCS] Failed to write credentials:', e);
  }
}

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { registerRoutes } from "./routes";
import { stopBackupVerificationCron, stopStatusHealthLoop } from "./routes/statusRoutes";
import { setupVite, serveStatic, log as viteLog } from "./vite";
import { createLogger } from './lib/logger';
import { pool } from "./db"; // Assuming 'pool' is your PostgreSQL client connection pool
import { monitoringService } from "./monitoring";
import { CACHING } from './config/platformConfig';
import { DOMAINS } from '@shared/platformConfig';
import { startAutonomousScheduler } from "./services/autonomousScheduler";
import { ensureRequiredTables } from "./services/dbMigrationService";
import { stopDecemberHolidayCron } from "./services/holidayService";
import { runLegacyBootstraps } from "./services/legacyBootstrapRegistry";
import { ensureCriticalConstraints } from "./services/criticalConstraintsBootstrap";
import { ensureWorkspaceIndexes } from "./services/workspaceIndexBootstrap";
import { ensureIdentityIntegrity } from "./services/identityIntegrityBootstrap";
import { runStartupRecovery, checkObjectStorageConfig } from "./lib/startupRecovery";
import { isProduction as isProductionEnv } from "./lib/isProduction";
import { ensurePerformanceIndexes, registerNdsQueueMonitor } from "./services/performanceIndexService";
import { validateAndLogConfiguration } from "./utils/configValidator";
import { runArchitectureLint } from "./utils/architectureLinter";
import { execSync } from "child_process";
import * as net from "net";
import * as fs from "fs";

// ============================================================================
// ROBUST PORT MANAGEMENT SYSTEM
// Railway-only. Railway binds the container port automatically and does
// not require the host-level zombie-kill / lsof / fuser scrubbing that
// the legacy Replit code path used. Cloud Run remains supported.
// ============================================================================

const PORT_LOCK_FILE = '/tmp/coaileague-port-5000.lock';
let serverInstance: any = null;
let isShuttingDown = false;

// Detect Cloud Run environment - skip ALL port cleanup, bind immediately
const IS_CLOUD_RUN = !!(process.env.K_SERVICE || process.env.K_REVISION || process.env.CLOUD_RUN_JOB);

// Check if port is actually available by attempting exclusive bind
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const testServer = net.createServer();
    testServer.once('error', () => resolve(false));
    testServer.once('listening', () => {
      testServer.close(() => resolve(true));
    });
    testServer.listen(port, '0.0.0.0');
  });
}

// Kill processes using port with multiple strategies
function killPortProcesses(port: number): void {
  try {
    // Strategy 1: Kill by port using lsof
    execSync(`lsof -ti:${port} | xargs -r kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (e) { /* ignore */ }
  
  try {
    // Strategy 2: Kill by port using fuser
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (e) { /* ignore */ }
  
  try {
    // Strategy 3: Read PID from lock file and kill
    if (fs.existsSync(PORT_LOCK_FILE)) {
      const pid = fs.readFileSync(PORT_LOCK_FILE, 'utf8').trim();
      if (pid && !isNaN(parseInt(pid))) {
        execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'ignore' });
      }
      fs.unlinkSync(PORT_LOCK_FILE);
    }
  } catch (e) { /* ignore */ }
}

// Wait for port to become available with retry
async function waitForPortAvailable(port: number, maxRetries: number = 10, retryDelay: number = 500): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await isPortAvailable(port)) {
      return true;
    }
    log.info('Port busy, retrying', { port, attempt: i + 1, maxRetries });
    
    // Try to kill processes on each retry
    if (i > 0) {
      killPortProcesses(port);
    }
    
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  return false;
}

// Create PID lock file
function createLockFile(): void {
  try {
    fs.writeFileSync(PORT_LOCK_FILE, process.pid.toString());
    log.info('Lock file created', { pid: process.pid });
  } catch (e) {
    log.warn('Could not create lock file');
  }
}

// Remove PID lock file
function removeLockFile(): void {
  try {
    if (fs.existsSync(PORT_LOCK_FILE)) {
      fs.unlinkSync(PORT_LOCK_FILE);
    }
  } catch (e) { /* ignore */ }
}

// Comprehensive port cleanup with verification
async function cleanupAndVerifyPort(port: number): Promise<boolean> {
  log.info('Starting port cleanup', { port });
  
  // First attempt - check if port is already free
  if (await isPortAvailable(port)) {
    log.info('Port is available', { port });
    return true;
  }
  
  // Kill existing processes
  killPortProcesses(port);
  
  // Wait for port with retries
  const available = await waitForPortAvailable(port, 15, 300);
  
  if (available) {
    log.info('Port cleanup successful', { port });
  } else {
    log.error('CRITICAL: Port could not be freed after all attempts', { port });
  }
  
  return available;
}
// NOTE: multiCompanyRoutes, gateDutyRoutes, surveyRoutes, wellnessRoutes,
// trainingCertificationRouter, complianceEvidenceRoutes, trinityThoughtStatusRouter,
// alertConfigRouter, platformConfigValuesRouter are mounted in server/routes.ts.
// Do NOT re-import them here — OMEGA LAW 24: No dead imports.
import { ensureWorkspaceAccess } from './middleware/workspaceScope';
import { requireAuth } from './rbac';
import { scheduleNonBlocking } from './lib/scheduleNonBlocking';
import { initializeNotifications } from "./services/notificationInit";
import { aiBrainMasterOrchestrator } from "./services/ai-brain/aiBrainMasterOrchestrator";
import { platformEventBus } from "./services/platformEventBus";
// handlePlatformChangeEvent import removed - no longer used as subscriber (dual-path dedup fix)
import { startNotificationCleanupScheduler } from "./services/notificationCleanupService";
import { initTokenCleanupScheduler } from "./services/tokenCleanupService";
import { initializeOrchestrationServices, setOrchestrationWebSocketBroadcaster } from "./services/ai-brain/orchestrationBridge";
import { broadcastToWorkspace } from "./websocket";
import { initializeSkillsSystem } from "./services/ai-brain/skills/skill-loader";
import "./services/scheduleLiveNotifier";
import { tracingMiddleware } from "./services/infrastructure/distributedTracing";
import { maintenanceMiddleware, maintenanceStatusHeader } from './middleware/maintenanceMiddleware';
import { requestIdMiddleware } from './middleware/requestId';
import { trinityTokenTracking } from './middleware/trinityTokenTrackingMiddleware';
// statewideWriteGuard import removed — protected status is billing-only, not read-only
import { validateEnvironment } from './startup/validateEnvironment';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimitMiddleware, rateLimiting } from "./services/infrastructure/rateLimiting";
import { trimStrings } from "./utils/sanitize";
import { initializeTrinityEventSubscriptions } from "./services/trinityEventSubscriptions";
import { trinityKnowledgeService } from "./services/ai-brain/trinityKnowledgeService";
import { complianceScoringBridge } from "./services/compliance/complianceScoringBridge";
import { runProductionSeed, runPasswordMigrations, runDataCorrections, runWorkspaceHealthCorrections, runProductionDataCleanup } from "./services/productionSeed";
import { runDevelopmentSeed, ensurePhase0Seed, ensurePhase0ExtendedSeed } from "./services/developmentSeed";
// NOTE: assertEnvironment from ./config/envValidation is intentionally NOT
// imported. The active validator is validateEnvironment from ./startup/
// validateEnvironment which is called inside startServer(). Keeping a single
// source of truth avoids drift between the two var lists.

const log = createLogger('server');

const app = express();

// Trust proxy MUST be set before any middleware reads req.ip (rate limiting, CORS origin logging).
// TRINITY.md §A: use isProductionEnv() from lib/isProduction — not process.env.REPLIT_DEPLOYMENT.
app.set('trust proxy', 1);

// Phase 97 security: remove framework fingerprint and add critical headers for ALL routes
// (must be placed before /health so even that route gets proper security headers)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(self), payment=(self)');
  // CSP on every route including /health — helmet will override with full
  // policy on subsequent routes. Replit dev domains removed (legacy).
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'self'");
  }
  next();
});

// CRITICAL: Register lightweight health endpoint FIRST, before ANY middleware
// This ensures it responds immediately for Cloud Run health checks
app.get('/health', rateLimitMiddleware(
  (req) => req.ip || 'anonymous',
  () => 'free'
), async (req, res) => {
  const requestStart = Date.now();
  const { monitoringService } = await import("./monitoring");
  const health = await monitoringService.getHealthStatus();

  // DB latency probe
  let dbLatencyMs = 0;
  let dbConnected = false;
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    dbLatencyMs = Date.now() - dbStart;
    dbConnected = true;
  } catch (dbHealthErr: any) {
    log.warn('[HealthCheck] DB ping failed', { error: dbHealthErr?.message });
  }

  const checkConfigured = (key: string) => !!process.env[key];

  res.setHeader('Content-Type', 'application/json');
  return res.status(health.status === 'down' ? 503 : 200).send(JSON.stringify({
    status: health.status,
    timestamp: health.timestamp.toISOString(),
    database: {
      connected: dbConnected,
      latencyMs: dbLatencyMs,
    },
    uptime: process.uptime(),
    latencyMs: Date.now() - requestStart,
    queueWorkers: health.checks.queue_workers || false,
    nds: health.checks.nds || false,
    trinity: health.checks.ai || false,
  }));
});

app.get('/api/platform/readiness', rateLimitMiddleware(
  (req) => req.ip || 'anonymous',
  () => 'free'
), async (req, res) => {
  const checks: Record<string, { status: string; detail?: string }> = {};

  checks.database = { status: process.env.DATABASE_URL ? 'configured' : 'MISSING' };
  checks.sessionSecret = { status: (process.env.SESSION_SECRET?.length || 0) >= 32 ? 'configured' : 'WEAK' };
  checks.encryptionKey = { status: /^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY || '') ? 'configured' : 'MISSING' };
  checks.corsOrigins = {
    status: process.env.ALLOWED_ORIGINS ? 'locked' : 'WARNING',
    detail: process.env.ALLOWED_ORIGINS
      ? `Locked to: ${process.env.ALLOWED_ORIGINS}`
      : 'ALLOWED_ORIGINS not set — CORS using pattern fallback',
  };
  checks.stripe = {
    status: process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_SECRET_KEY.includes('_test_') ? 'test-mode' : 'live') : 'MISSING',
  };
  checks.stripeWebhook = { status: process.env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'MISSING' };

  const missingPriceIds = [
    'STRIPE_PRICE_STARTER_MONTHLY',
    'STRIPE_PRICE_PROFESSIONAL_MONTHLY',
  ].filter(k => !process.env[k]);
  checks.stripePriceIds = {
    status: missingPriceIds.length === 0 ? 'configured' : 'MISSING',
    detail: missingPriceIds.length > 0 ? `Missing: ${missingPriceIds.join(', ')} — upgrades will fail` : undefined,
  };
  if (missingPriceIds.length > 0) {
    log.warn('[Startup] Missing Stripe price IDs — upgrades will fail:', missingPriceIds);
  }
  checks.emailService = { status: process.env.RESEND_API_KEY ? 'configured' : 'MISSING' };
  checks.aiEngine = { status: process.env.GEMINI_API_KEY ? 'configured' : 'MISSING' };
  checks.monitoringWebhook = { status: process.env.MONITORING_WEBHOOK_URL ? 'configured' : 'not-set', detail: 'For error alerts' };
  checks.nodeEnv = { status: process.env.NODE_ENV || 'development' };
  checks.deployment = { status: isProductionEnv() ? 'production' : 'development' };

  const critical = ['database', 'sessionSecret', 'encryptionKey', 'corsOrigins', 'stripe', 'stripeWebhook', 'emailService', 'aiEngine'];
  const failures = critical.filter(k => checks[k].status === 'MISSING' || checks[k].status === 'WEAK' || checks[k].status === 'open');

  const operationalItems = [
    { item: 'Error monitoring (Sentry or equivalent)', status: process.env.MONITORING_WEBHOOK_URL ? 'webhook-configured' : 'needs-setup' },
    { item: 'Uptime monitor (external)', status: 'verify-externally' },
    { item: 'Database backups', status: 'verify-with-provider' },
    { item: 'SPF/DKIM/DMARC email auth', status: 'verify-dns-records' },
    { item: 'Terms of Service', status: 'verify-legal-docs' },
    { item: 'Privacy Policy', status: 'verify-legal-docs' },
    { item: 'Data Processing Agreement', status: 'prepare-if-requested' },
    { item: 'Incident response plan', status: 'document-before-launch' },
    { item: 'Rollback procedure', status: 'document-before-launch' },
    { item: 'Data retention policy', status: 'document-before-launch' },
    { item: 'Tenant support channel', status: 'establish-before-launch' },
    { item: 'Browser compatibility (Chrome/Safari/Firefox/Edge)', status: 'test-manually' },
    { item: 'Performance baseline (<3s critical pages)', status: 'test-manually' },
  ];

  const isPlatformStaff = req.session?.role &&
    ['root_admin', 'sysop', 'platform_staff', 'platform_support'].includes(req.session.role);

  if (!isPlatformStaff) {
    return res.json({ readiness: failures.length === 0 ? 'READY' : 'NOT_READY' });
  }

  res.json({
    readiness: failures.length === 0 ? 'READY' : 'NOT_READY',
    failureCount: failures.length,
    failures,
    checks,
    operationalChecklist: operationalItems,
  });
});

// ============================================================================
// CORS — must run before body parsers so preflight OPTIONS requests are handled
// before any unnecessary request body is read.
// ============================================================================
const isProdDeployment = isProductionEnv();
const explicitAllowedOrigins: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];
const defaultOrigins = [
  `https://${DOMAINS.www}`,
  `https://${DOMAINS.root}`,
];
const defaultOriginPatterns = defaultOrigins.map(
  (allowedOrigin) => new RegExp(`^${allowedOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
);
const fallbackOriginPatterns = [
  ...defaultOriginPatterns,
  new RegExp(`^https?:\/\/([a-zA-Z0-9-]+\.)*${DOMAINS.root.replace('.', '\\.')}$`),
  // Railway deployment URLs — dev and staging environments
  /^https?:\/\/[a-zA-Z0-9-]+\.up\.railway\.app$/,
  ...(isProdDeployment ? [] : [
    /^https?:\/\/localhost(?::\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
    /^https?:\/\/0\.0\.0\.0(?::\d+)?$/,
  ]),
];

if (isProdDeployment && explicitAllowedOrigins.length === 0) {
  log.warn('[CORS] WARNING: No ALLOWED_ORIGINS set in production — falling back to coaileague.com patterns. Set ALLOWED_ORIGINS to your production domain(s) for proper lockdown.');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      if (isProdDeployment && explicitAllowedOrigins.length > 0) {
        return callback(null, false);
      }
      return callback(null, true);
    }

    if (explicitAllowedOrigins.length > 0) {
      const isAllowed = explicitAllowedOrigins.includes(origin);
      return callback(null, isAllowed);
    }

    // CORS allowlist (TRINITY.md §6 platform identity): only coaileague.com
    // and dev-host loopbacks. Replit domains removed.
    const isAllowed = fallbackOriginPatterns.some((pattern) => pattern.test(origin));
    callback(null, isAllowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With', 'Accept', 'Origin'],
}));

// ============================================================================
// WWW-REDIRECT — redirect bare coaileague.com → www.coaileague.com
// Temporary fallback: www.coaileague.com is the canonical domain while
// DNS ownership of the root domain transfers. Once nameserver changes are
// complete this middleware will still work safely as a permanent redirect.
// ============================================================================
app.use((req, res, next) => {
  const host = req.hostname;
  // Exempt ALL /api/ paths from redirect — webhooks must never be redirected.
  // Twilio, Plaid, Stripe, Resend all call /api/* and cannot follow redirects.
  if (host === DOMAINS.root && !req.path.startsWith('/api/')) {
    const wwwUrl = `https://${DOMAINS.www}${req.originalUrl}`;
    return res.redirect(301, wwwUrl);
  }
  next();
});

// Paths that need raw body capture for webhook signature verification
const webhookPathsNeedingRawBody = [
  '/api/webhooks/quickbooks',
  '/api/webhooks/resend',
  '/api/webhooks/resend/inbound',
  '/api/stripe/webhook',
  '/api/webhooks/twilio/voice-interview',
  '/api/webhooks/twilio/sms',
  '/api/webhooks/twilio/status',
  '/api/inbound/email',
];

// Paths that accept form-encoded bodies (e.g. Twilio voice/SMS webhooks)
const formEncodedPaths = [
  '/api/voice/',
  '/api/sms/inbound',
  '/api/sms/status',
];

// Use express.json with verify function to capture raw body for webhooks
app.use((req, res, next) => {
  // Enforce JSON for API routes, except for specific webhook paths that might use other formats
  // or paths that we've already identified as needing raw body capture.
  const isApiRoute = req.path.startsWith('/api/');
  const isWebhookRoute = webhookPathsNeedingRawBody.some(path => req.path === path || req.path.startsWith(path));
  // Twilio voice webhooks are form-encoded — exempt them from the JSON-only gate
  const isFormEncodedRoute = formEncodedPaths.some(path => req.path.startsWith(path));

  if (isApiRoute && !isWebhookRoute && !isFormEncodedRoute) {
    const contentType = req.headers['content-type'];
    if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'OPTIONS') {
      if (!contentType || !contentType.includes('application/json')) {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: 'Only application/json is supported for this endpoint'
        });
      }
    }
  }
  next();
});

app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 26214400) { // 25MB
    return res.status(413).json({ error: 'Request entity too large' });
  }
  next();
});

app.use(express.json({
  limit: '10mb',
  verify: (req: any, res, buf) => {
    // Capture raw body for webhook paths that need signature verification
    if (webhookPathsNeedingRawBody.some(path => req.path === path || req.path.startsWith(path))) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));

// P25-4: JSON depth-bomb guard — reject payloads nested deeper than 10 levels.
// express.json() enforces a 10 MB size limit but imposes no nesting limit,
// allowing a tiny payload with thousands of nested objects to exhaust the call stack.
function measureDepth(value: unknown, depth = 0): number {
  if (depth > 10) return depth;
  if (value === null || typeof value !== 'object') return depth;
  const children = Array.isArray(value) ? value : Object.values(value as object);
  let max = depth;
  for (const child of children) {
    const d = measureDepth(child, depth + 1);
    if (d > max) max = d;
    if (max > 10) break;
  }
  return max;
}

app.use((req, res, next) => {
  if (req.is('application/json') && req.body && typeof req.body === 'object') {
    if (measureDepth(req.body) > 10) {
      return res.status(400).json({ error: 'JSON payload nesting depth exceeds maximum allowed (10 levels).' });
    }
    req.body = trimStrings(req.body);
  }
  next();
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware — attaches UUID to every request for tracing
app.use(requestIdMiddleware);
// Trinity token tracking — attaches trinityOperationId for token metering (Phase 16A)
app.use(trinityTokenTracking);

// NOTE: statewideWriteGuard was removed.
// Protected status (GRANDFATHERED_TENANT_ID) means billing-exempt + enterprise tier only.
// It does NOT mean read-only. Workflows, automations, pipelines, and Trinity orchestration
// must be able to write data on the protected org. See server/middleware/statewideGuard.ts.

// Cache-Control: no-store on all API responses — prevents sensitive data caching
// by proxies, CDNs, or shared browser caches.
app.use('/api', (_req, res, next) => {
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
  next();
});

// ============================================================================
// IFRAME EMBEDDING POLICY
// ============================================================================
// X-Frame-Options is NOT set. We don't need SAMEORIGIN here — the CSP
// frame-ancestors directive is the authoritative control. The legacy
// Replit webview workaround (which required *.replit.dev, *.replit.app,
// *.repl.co in frame-ancestors) has been removed.
// ============================================================================

// Security headers with helmet - protects against XSS, clickjacking, MIME sniffing
// Configure to work with Vite in development and production
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"], // unpkg for swagger-ui
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "https://*.tile.openstreetmap.org"],
      // CSP allowlist (TRINITY.md §6 platform identity): only the
      // production-relevant SaaS partners. Replit dev domains have been
      // removed — they were a legacy artifact from the Replit hosting
      // era and are no longer needed on Railway production.
      connectSrc: [
        "'self'",
        "wss:",
        `https://${DOMAINS.root}`,
        `https://${DOMAINS.www}`,
        `https://*.${DOMAINS.root}`,
        "https://api.anthropic.com",
        "https://api.openai.com",
        "https://generativelanguage.googleapis.com",
        "https://api.resend.com",
        "https://api.stripe.com",
        "https://*.stripe.com",
        "https://production.plaid.com",
        "https://sandbox.plaid.com",
        "https://development.plaid.com",
        "https://api.twilio.com",
        "https://*.twilio.com",
      ],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      // frame-ancestors only allows self — Replit webview embedding is no
      // longer needed on Railway. If we ever need to embed in a partner
      // site, add the explicit origin here.
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for Vite assets
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Replit preview/webview access
  // DO NOT ADD X-Frame-Options - breaks Replit webview iframe embedding!
  frameguard: false,
  xssFilter: true, // X-XSS-Protection: 1; mode=block
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // @ts-expect-error — TS migration: fix in refactoring sprint
  contentTypeOptions: true, // X-Content-Type-Options: nosniff
  // G24-03 fix: Explicit HSTS with 1-year max-age (Phase 24 spec requires min 1 year).
  // Helmet default is 180 days — overriding to 365 days (31536000s) with includeSubDomains.
  // preload intentionally excluded — preloading requires domain registration and is irreversible.
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: false,
  },
  // NOTE: Permissions-Policy header is set by the manual middleware at the
  // top of this file (see app.use at line ~211). Helmet 7+ does not accept a
  // permissionsPolicy option — passing it here was silently ignored.
}));

// CRITICAL: Explicitly remove X-Frame-Options header to ensure Replit webview works
// This runs after helmet in case anything else sets the header
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  next();
});

// Startup configuration validation — catch misconfigs before they cause runtime failures
const configValid = validateAndLogConfiguration();
if (!configValid && isProductionEnv()) {
  log.error('[FATAL] Configuration validation failed in production — refusing to start');
  process.exit(1);
}

// Service Worker handling - proper headers for PWA detection.
// /sw.js is the canonical SW (registered by client/src/main.tsx). The
// /service-worker.js path is kept as a header passthrough so legacy clients
// that still have the old SW URL cached can fetch a 404 with the correct
// content-type / scope headers and unregister cleanly.
app.get(['/sw.js', '/service-worker.js'], (req, res, next) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

// Static asset caching middleware - aggressive caching for icons, favicons, fonts
// This significantly improves page load performance by reducing redundant requests
app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  // Cache static assets like favicons, icons, fonts for 1 week
  if (path.match(/\.(ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/) ||
      path.includes('/icons/') || 
      path.includes('/favicon')) {
    res.setHeader('Cache-Control', `public, max-age=${CACHING.staticAssetMaxAgeSec}, immutable`);
    res.setHeader('Vary', 'Accept-Encoding');
  }
  // Cache JS/CSS bundles for 1 day (they have content hashes in production)
  else if (path.match(/\.(js|css)$/) && path.includes('/assets/')) {
    res.setHeader('Cache-Control', `public, max-age=${CACHING.bundleMaxAgeSec}, immutable`);
    res.setHeader('Vary', 'Accept-Encoding');
  }
  next();
});

// NOTE: Multi-company, gate-duty, compliance-evidence, surveys, and wellness routes
// were moved to AFTER registerRoutes() so they run after session/passport are initialized.
// See the registerRoutes() call below.

// Distributed tracing middleware - adds trace IDs to all requests (skip health endpoints)
// NOTE: tracingMiddleware is a factory function, so we invoke it with () to get the actual middleware
const tracingHandler = tracingMiddleware('coaileague-api');
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/health') {
    return next();
  }
  tracingHandler(req, res, next);
});

// Maintenance mode middleware - seals platform during maintenance, allows bypass for crawlers
app.use(maintenanceMiddleware);
app.use(maintenanceStatusHeader);

// Rate limiting middleware - applies per-tenant quotas on API routes
app.use('/api', rateLimitMiddleware(
  (req: any) => {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.session?.currentWorkspaceId;
    if (workspaceId) return String(workspaceId);
    const userId = req.session?.userId;
    if (userId) return `user-${userId}`;
    const ip = req.headers['x-forwarded-for'];
    return typeof ip === 'string' ? ip.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || 'anonymous');
  },
  (req: any) => {
    const plan = req.session?.plan || req.session?.workspacePlan;
    if (plan && ['free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic'].includes(plan)) {
      return plan as 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
    }
    return 'free';
  }
));

// Phase 39 — Gzip compression for all API responses above 1KB threshold
app.use(compression({
  threshold: 1024,  // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// Performance monitoring middleware - tracks all requests
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Track metrics in monitoring service
    const userId = req.session?.userId;
    const workspaceId = (req as any).workspaceId || req.user?.workspaceId || req.session?.currentWorkspaceId;
    
    monitoringService.trackRequest(
      path,
      req.method,
      duration,
      res.statusCode,
      { userId, workspaceId }
    );
    
    // Keep existing console logging for development
    if (path.startsWith("/api")) {
      // FIX [CONSOLE LOG PII]: Never log full API response bodies — they can contain
      // SSN, bank account numbers, payroll data, and other PII that would appear in
      // plaintext in any log aggregator. Log only method, path, status, and duration.
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      viteLog(logLine);
    }
  });

  next();
});

// Session middleware and authentication will be set up by registerRoutes/setupAuth
// DO NOT set up session middleware here - it's handled in routes.ts via setupAuth

// Note: Graceful shutdown handled by unified gracefulShutdown() registered below

// ============================================================================
// STARTUP TIMING UTILITY
// ============================================================================
function timedInit(name: string, fn: () => Promise<void>): Promise<{ name: string; duration: number; success: boolean; error?: string }> {
  const start = Date.now();
  return fn()
    .then(() => ({ name, duration: Date.now() - start, success: true }))
    .catch((err) => ({ name, duration: Date.now() - start, success: false, error: err.message }));
}

// Deferred init — delays DB-heavy startup tasks to prevent connection pool exhaustion
function deferredTimedInit(name: string, delayMs: number, fn: () => Promise<void>): Promise<{ name: string; duration: number; success: boolean; error?: string }> {
  return new Promise(resolve => {
    setTimeout(() => {
      const start = Date.now();
      fn()
        .then(() => resolve({ name, duration: Date.now() - start, success: true }))
        .catch((err) => resolve({ name, duration: Date.now() - start, success: false, error: err.message }));
    }, delayMs);
  });
}

// ============================================================================
// PHASE 1: CRITICAL SERVICES (must run before server listens)
// ============================================================================
async function initializeCriticalServices() {
  // Initialize rate limiting service
  try {
    await rateLimiting.initialize();
    log.info('Rate limiting service initialized');
  } catch (error) {
    log.error('Rate limiting initialization failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Auto-migrate database tables - ensures production has all required tables
  try {
    await ensureRequiredTables();
  } catch (error) {
    log.error('Database migration check failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Legacy table bootstraps — runs CREATE TABLE IF NOT EXISTS statements that
  // were previously fired from module-load IIFEs in route files. Now collected
  // into a single registry so they execute after the DB pool is verified up.
  try {
    await runLegacyBootstraps();
  } catch (error) {
    log.error('Legacy bootstrap phase failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Critical raw-SQL constraints (race-condition guards, gist exclusions)
  // that the Drizzle DSL cannot express. Idempotent — safe on every boot.
  // 🔴 Critical for shift overlap prevention (RC5 Phase 2 — see shiftRoutes.ts)
  try {
    await ensureCriticalConstraints();
  } catch (error) {
    log.error('Critical constraints bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // workspace_id performance indexes — installs btree indexes on every
  // multi-tenant table that lacks one in the Drizzle schema declaration.
  // TRINITY.md §9: All workspace_id columns indexed.
  try {
    await ensureWorkspaceIndexes();
  } catch (error) {
    log.error('Workspace index bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Universal identity invariants — workspace-scoped uniqueness on the
  // three identity columns (workspaces.org_id, employees.employee_number,
  // clients.client_number), an immutability trigger that blocks direct
  // UPDATEs to them unless the session opens an authorized override, and
  // a backfill sweep that populates any row still missing its ID.
  try {
    await ensureIdentityIntegrity();
  } catch (error) {
    log.error('Identity integrity bootstrap failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Option B storage quota tables — create if not exists (idempotent)
  try {
    const { ensureStorageTables } = await import('./services/storage/storageQuotaService');
    await ensureStorageTables();
  } catch (error) {
    log.error('Storage quota table init failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // TRINITY.md Section R / Law P4 — startup recovery: clear stale payroll
  // locks, mark interrupted goals & supervisor handoffs from the prior boot.
  // Non-fatal — degraded recovery is preferable to a stalled boot.
  try {
    await runStartupRecovery();
  } catch (error) {
    log.error('Startup recovery failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
  }

  // TRINITY.md Section R / Law P3 — surface missing object-storage configuration
  // at boot so file-upload failures do not appear as silent 500s later.
  checkObjectStorageConfig();

  // FOUNDER EXEMPTION GUARANTEE: Ensure the grandfathered founding tenant always has
  // founder_exemption=true and billing_exempt=true. Safe to run in dev —
  // if GRANDFATHERED_TENANT_ID is not set, the function exits immediately.
  try {
    const { ensureFounderExemption } = await import('./services/billing/founderExemption');
    await ensureFounderExemption();
  } catch (error) {
    log.error('Founder exemption guarantee failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // STATE REGULATORY CONFIG SEED — removed (stateRegulatoryRoutes deleted in refactor)

  // ── ALL DB-DEPENDENT SEEDING: skip entirely if DB unreachable ───────────────
  const dbAvailableForSeed = await (async () => {
    try {
      const { probeDbConnection } = await import('./db');
      return await probeDbConnection();
    } catch { return false; }
  }).catch((err: any) => {
      log.error(`[PostListen] Unhandled crash: ${err instanceof Error ? err.message : String(err)}`);
    });

  // ── CANONICAL SEED GATE ──────────────────────────────────────────────────────
  // Seeds run ONCE when a new local dev environment is set up.
  // On Railway (any environment) they NEVER run automatically — data persists
  // in Neon across deploys. Seeding on Railway drowns the DB on every restart
  // and adds 30-120s of serial DB round-trips to startup time.
  //
  // To seed manually on Railway: run `node server/scripts/run-seed.js` from CLI
  // or set SEED_ON_STARTUP=true temporarily in Railway Variables tab (remove after).
  //
  // Local dev: seeds run automatically because RAILWAY_SERVICE_ID won't be set.
  const isRailwayDeploy = !!process.env.RAILWAY_SERVICE_ID;
  const seedExplicitlyEnabled = process.env.SEED_ON_STARTUP === 'true';
  const shouldSeed = !isRailwayDeploy || seedExplicitlyEnabled;

  if (!dbAvailableForSeed) {
    log.warn('Phase 1 seeding skipped — DB unreachable');
  } else if (isProductionEnv() && !seedExplicitlyEnabled) {
    log.info('[Startup] Production environment — seeding skipped');
  } else if (isRailwayDeploy && !seedExplicitlyEnabled) {
    log.info('[Startup] Railway deployment detected — seeding skipped (data persists in Neon across deploys). Set SEED_ON_STARTUP=true to seed manually.');
  } else {

  // Seed development data (only runs in non-production, idempotent)
  try {
    const seedResult = await runDevelopmentSeed();
    log.info('Development seed', { result: seedResult.message });
  } catch (error) {
    log.error('Development seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Seed comprehensive Acme Security demo workspace (demo-workspace-00000000)
  try {
    const { seedAcmeFullDemo } = await import('./seed-acme-full');
    await seedAcmeFullDemo();
    log.info('Acme demo seed complete');
  } catch (error) {
    log.error('Acme demo seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Phase 0 seed — Marcus Rodriguez + Downtown Mall + chatroom + 15 messages
  // Runs independently of main seed (own sentinel), safe on every restart
  try {
    await ensurePhase0Seed();
  } catch (error) {
    log.error('Phase 0 seed failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Phase 0 extended seed — routine, photo-only, and abandoned shift variants for Marcus Rodriguez
  // Sentinel: dev-chatroom-marcus-routine — safe to call on every restart
  try {
    await ensurePhase0ExtendedSeed();
  } catch (error) {
    log.error('Phase 0 extended seed failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Enrich dev sandbox with comprehensive data for Trinity (only dev, idempotent)
  try {
    const { runDevDataEnrichment } = await import("./services/developmentSeedEnrichment");
    const enrichResult = await runDevDataEnrichment();
    log.info('Development data enrichment', { result: enrichResult.message });
  } catch (error) {
    log.error('Development enrichment failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }
  
  // Seed rich communications & Trinity activity data for dev sandbox (only dev, idempotent)
  try {
    const { runCommunicationsSeed } = await import("./services/developmentSeedCommunications");
    const commsResult = await runCommunicationsSeed();
    log.info('Development communications seed', { result: commsResult.message });
  } catch (error) {
    log.error('Communications seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Seed Acme operational data (guard tours, GPS, DAR reports, BOLOs, incidents, compliance, payroll, RMS)
  try {
    const { runAcmeOperationalSeed, ensureFutureOpenShifts } = await import("./services/developmentSeedOperational");
    const opsResult = await runAcmeOperationalSeed();
    log.info('Acme operational seed', { result: opsResult.message });
    // Always ensure there are future open shifts for Trinity to process
    await ensureFutureOpenShifts();
  } catch (error) {
    log.error('Acme operational seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Anvil Security — core data (workspace, users, employees, clients)
  try {
    const { runAnvilCoreSeed } = await import("./services/developmentSeedAnvil");
    const anvilResult = await runAnvilCoreSeed();
    log.info('Anvil core seed', { result: anvilResult.message });
  } catch (error) {
    log.error('Anvil core seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Anvil Security — operational data (shifts, payroll, guard tours, invoices)
  try {
    const { runAnvilOperationalSeed } = await import("./services/developmentSeedAnvilOperational");
    const anvilOpsResult = await runAnvilOperationalSeed();
    log.info('Anvil operational seed', { result: anvilOpsResult.message });
  } catch (error) {
    log.error('Anvil operational seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Compliance data — documents, alerts, post orders for both orgs
  try {
    const { runComplianceSeed } = await import("./services/developmentSeedCompliance");
    const compResult = await runComplianceSeed();
    log.info('Compliance seed', { result: compResult.message });
  } catch (error) {
    log.error('Compliance seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Guard card & employee compliance data (new audit columns — idempotent)
  try {
    const { runGuardCardEnrichment } = await import("./services/developmentSeedCompliance");
    const gcResult = await runGuardCardEnrichment();
    log.info('Guard card enrichment', { result: gcResult.message });
  } catch (error) {
    log.error('Guard card enrichment failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Monthly open shifts — Trinity automation testing
  // Seeds current month with open/understaffed shifts so Trinity's fill-shift
  // scanner, coverage gap detector, and HelpAI triggers all fire correctly.
  // Proves in development that the entire automation chain works before production.
  try {
    const { seedMonthlyShifts } = await import("./services/developmentSeedShifts");
    const shiftResult = await seedMonthlyShifts();
    log.info('Monthly shift seed', { result: shiftResult.message });
  } catch (error) {
    log.error('Monthly shift seed failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
  }

  // Contracts and incidents — both orgs
  try {
    const { runContractsAndIncidentsSeed } = await import("./services/developmentSeedContractsAndIncidents");
    const contractsResult = await runContractsAndIncidentsSeed();
    log.info('Contracts/incidents seed', { result: contractsResult.message });
  } catch (error) {
    log.error('Contracts/incidents seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Financial integrations seed — Acme (QB sandbox) + Anvil (Stripe-local)
  try {
    const { runFinancialIntegrationsSeed } = await import("./services/developmentSeedFinancialIntegrations");
    const finResult = await runFinancialIntegrationsSeed();
    log.info('Financial integrations seed', { result: finResult.message });
  } catch (error) {
    log.error('Financial integrations seed failed', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  } // end if (dbAvailableForSeed)

  // ChatServerHub Gateway - needed for WebSocket connections
  try {
    const { verifyTriadHealth } = await import("./services/ai-brain/trinityInfraActions");
    const { initializeChatServerHub } = await import("./services/ChatServerHub");
    await verifyTriadHealth();
    await initializeChatServerHub();
    log.info('ChatServerHub Gateway initialized successfully');
  } catch (error) {
    log.error('Failed to initialize ChatServerHub Gateway', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }

  // Trinity Knowledge Base — seed static industry knowledge modules (idempotent)
  try {
    await trinityKnowledgeService.seedStaticKnowledge();
  } catch (error) {
    log.error('Trinity knowledge seeding failed', { error: error instanceof Error ? error.message : String(error) });
  }

  // Gamification Event System - lightweight event listeners
  try {
    
    // REMOVED: Platform change notification subscribers
    // These were causing DUPLICATE notifications because platformEventBus.publish() 
    // already routes events through storeInWhatsNew() → universalNotificationEngine.sendPlatformUpdate().
    // Having handlePlatformChangeEvent as a subscriber created a second notification path
    // with a different AI-reworded title, bypassing dedup (which checks exact title match).
    
    log.info('Gamification event system initialized');
  } catch (error) {
    log.error('Failed to initialize gamification events', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
  }
}

// ============================================================================
// PHASE 2: AI BRAIN CORE (runs in parallel after server listens)
// ============================================================================
async function initializeAIBrainCore(): Promise<void> {
  const results = await Promise.allSettled([
    timedInit('AI Brain Master Orchestrator', async () => {
      const { resilientAIGateway } = await import('./services/ai-brain/providers/resilientAIGateway');
      // resilientAIGateway constructor starts health monitoring
      log.info('AI Resilience Gateway initialized');
      
      await aiBrainMasterOrchestrator.initialize();
      try {
        const actionSummary = aiBrainMasterOrchestrator.getActionSummary();
        const totalActions = Object.values(actionSummary).reduce((a, b) => a + b, 0);
        log.info('AI Brain Master Orchestrator initialized', { totalActions, actionSummary });
      } catch (summaryErr) {
        log.info('AI Brain Master Orchestrator initialized (action summary deferred)');
      }
    }),
    
    timedInit('AI Notification System', async () => {
      await initializeNotifications();
      log.info('AI notification system initialized');
    }),
    
    timedInit('Orchestration Services', async () => {
      setOrchestrationWebSocketBroadcaster(broadcastToWorkspace);
      initializeOrchestrationServices();
      log.info('AI Brain Orchestration services initialized');
    }),

    timedInit('Trinity Consciousness Seed', async () => {
      // Trinity Consciousness Seed Pattern:
      // 1. Import somatic marker service (emotional/pattern memory) and narrative identity engine.
      // 2. Seed global platform patterns (somatic markers) that Trinity uses for anomaly detection.
      // 3. Select active workspaces to bootstrap their unique narrative identities.
      // 4. Initialize the identity engine for each workspace, allowing Trinity to 'remember'
      //    per-organization history, culture, and operational preferences.
      const { trinitySomaticMarkerService } = await import('./services/ai-brain/trinitySomaticMarkerService');
      const { trinityNarrativeIdentityEngine } = await import('./services/ai-brain/trinityNarrativeIdentityEngine');
      if (!process.env.RAILWAY_SERVICE_ID || process.env.SEED_ON_STARTUP === 'true') {
        await trinitySomaticMarkerService.seedPlatformPatterns();
      }
      log.info('Trinity somatic marker patterns seeded');
      const { pool } = await import('./db');
      // CATEGORY C — Raw SQL retained: Workspace ID scan for Trinity initialization | Tables: workspaces | Verified: 2026-03-23
      const wsResult = await pool.query<{ id: string }>(
        `SELECT id FROM workspaces WHERE is_deactivated IS NOT TRUE LIMIT 50`
      );
      await Promise.allSettled(
        wsResult.rows.map(row => trinityNarrativeIdentityEngine.initializeForWorkspace(row.id))
      );
      log.info('Trinity narrative identity initialized', { workspaceCount: wsResult.rows.length });
    }),
  ]);
  
  // Log timing results
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const { name, duration, success } = result.value;
      if (success) {
        log.info(`${name} completed`, { duration });
      } else {
        log.warn(`${name} FAILED`, { duration, error: result.value.error });
      }
    }
  });
}

// ============================================================================
// PHASE 3: EXTENDED SERVICES (runs in parallel, deferred)
// ============================================================================
async function initializeExtendedServices(): Promise<void> {
  const results = await Promise.allSettled([
    timedInit('Universal Diagnostic Orchestrator', async () => {
      const { registerUniversalDiagnosticActions } = await import("./services/ai-brain/universalDiagnosticOrchestrator");
      const { helpaiOrchestrator } = await import("./services/helpai/platformActionHub");
      await registerUniversalDiagnosticActions(helpaiOrchestrator);
      log.info('Universal Diagnostic Orchestrator initialized');
    }),

    timedInit('Universal ID Resolver Actions', async () => {
      const { registerUniversalIdActions } = await import('./services/ai-brain/actionRegistry');
      registerUniversalIdActions();
      log.info('Universal ID Resolver actions registered (Phase 57)');
    }),
    
    timedInit('Unified Lifecycle Manager', async () => {
      const { unifiedLifecycleManager } = await import('./services/ai-brain/unifiedLifecycleManager');
      await unifiedLifecycleManager.initialize();
      log.info('Unified Lifecycle Manager initialized - lifecycle hooks active');
    }),
    
    timedInit('Trinity Platform Connector', async () => {
      const { trinityPlatformConnector } = await import('./services/ai-brain/trinityPlatformConnector');
      await trinityPlatformConnector.initialize();
      log.info('Trinity Platform Connector initialized - service connections active');
    }),
    
    timedInit('AI Brain Skills System', async () => {
      await initializeSkillsSystem();
      log.info('AI Brain Skills System initialized');
    }),
    
    timedInit('Seasonal Subagent', async () => {
      const { initializeSeasonalSubagent } = await import('./services/ai-brain/seasonalSubagent');
      await initializeSeasonalSubagent();
      log.info('Seasonal Subagent initialized - Holiday theming active');
    }),
    
    timedInit('UI Control Subagent', async () => {
      const { uiControlSubagent } = await import('./services/ai-brain/uiControlSubagent');
      uiControlSubagent.registerActions();
      log.info('UI Control Subagent initialized - Trinity can manage UI layers');
    }),

    timedInit('Inbound Email Actions', async () => {
      const { registerInboundEmailActions } = await import('./services/trinity/inboundEmailActions');
      registerInboundEmailActions();
    }),

    timedInit('Recruitment Actions (Phase 58)', async () => {
      const { registerRecruitmentActions } = await import('./services/recruitment/trinityRecruitmentActions');
      registerRecruitmentActions();
    }),

    timedInit('Question Bank Seeder (Phase 58)', async () => {
      if (!!process.env.RAILWAY_SERVICE_ID && process.env.SEED_ON_STARTUP !== 'true') {
        log.info('[QuestionBank] Railway deploy — skipping seed (data persists in Neon)');
        return;
      }
      const { seedDefaultQuestionBank } = await import('./services/recruitment/questionBankSeeder');
      const result = await seedDefaultQuestionBank();
      log.info(`Question Bank Seeder: ${result.seeded} seeded, ${result.skipped} skipped`);
    }),

    timedInit('ACME Candidate Seed (Phase 58)', async () => {
      if (!!process.env.RAILWAY_SERVICE_ID && process.env.SEED_ON_STARTUP !== 'true') {
        log.info('[ACMECandidates] Railway deploy — skipping seed');
        return;
      }
      const { seedAcmeCandidates } = await import('./services/recruitment/acmeCandidateSeed');
      const result = await seedAcmeCandidates();
      log.info(`ACME Candidate Seed: ${result.seeded} seeded, ${result.skipped} skipped`);
    }),

    timedInit('HelpAI System Connectivity', async () => {
      // Seed Trinity's static knowledge modules — local dev only
      // On Railway these are already in the DB from the initial manual seed
      if (!process.env.RAILWAY_SERVICE_ID || process.env.SEED_ON_STARTUP === 'true') {
        const { trinityKnowledgeService } = await import('./services/ai-brain/trinityKnowledgeService');
        await trinityKnowledgeService.seedStaticKnowledge();
        log.info('Trinity static knowledge modules seeded');
      }

      // Register HelpAI knowledge tools in the tool capability registry
      const { toolCapabilityRegistry } = await import('./services/ai-brain/toolCapabilityRegistry');
      const toolCount = toolCapabilityRegistry.getAllTools().length;
      log.info(`HelpAI tools registered — ${toolCount} total tools in registry`);

      // Prime the Trinity-HelpAI command bus (verify DB connectivity, process any queued items)
      const { trinityHelpaiCommandBus: commandBus } = await import('./services/helpai/trinityHelpaiCommandBus');
      const pending = await commandBus.getPendingForTrinity();
      if (pending.length > 0) {
        log.warn(`[HelpAI CommandBus] ${pending.length} unprocessed command bus items found at startup — reviewing`);
      }
      log.info('Trinity-HelpAI Command Bus connectivity verified');
    }),

    timedInit('Trinity Voice Actions', async () => {
      const { registerVoiceActions } = await import('./services/trinityVoice/trinityVoiceActions');
      const { helpaiOrchestrator } = await import('./services/helpai/platformActionHub');
      registerVoiceActions(helpaiOrchestrator);
      // Seed ACME sandbox with voice test data — local dev only, never on Railway
      if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_SERVICE_ID) {
        const { seedAcmeVoiceData } = await import('./services/trinityVoice/acmeSeed');
        await seedAcmeVoiceData();
      }
    }),

    timedInit('Hebbian Decay Scheduler', async () => {
      const { runDecayCycle } = await import('./services/ai-brain/hebbianLearningService');
      // Run decay once at startup (catches any missed nightly runs after a restart)
      runDecayCycle().catch((err: any) =>
        log.warn('Hebbian startup decay failed (non-fatal)', { error: err?.message })
      );
      // Schedule nightly decay — every 24 hours
      setInterval(() => {
        runDecayCycle().catch((err: any) =>
          log.warn('Hebbian nightly decay failed (non-fatal)', { error: err?.message })
        );
      }, 24 * 60 * 60 * 1000).unref();
      log.info('Hebbian Decay Scheduler initialized — forgetting curve active (24h cycle)');
    }),

    timedInit('Analytics Snapshot Cron', async () => {
      const { scheduleDailyAnalyticsSnapshot } = await import('./services/analyticsSnapshotService');
      scheduleDailyAnalyticsSnapshot();
      log.info('Analytics Snapshot Cron initialized — daily 2AM UTC snapshot + 9 Trinity BI actions registered');
    }),

    timedInit('Trinity Dream State', async () => {
      const { trinityDreamState } = await import('./services/ai-brain/trinityDreamState');
      trinityDreamState.scheduleNightlyCycle();
      log.info('Trinity Dream State initialized — cognitive nightly consolidation scheduled (2am UTC)');
    }),

    timedInit('Invoice Overdue Sweep Scheduler', async () => {
      // SCHED-01 FIX: processDelinquentInvoices() was never auto-scheduled — it only ran
      // when POST /invoices/process-reminders was called manually. Invoices could sit past
      // due for 30+ days with no status change and no reminders sent unless an operator
      // remembered to trigger the endpoint. This adds a 24-hour sweep over all active
      // workspaces so reminders and overdue transitions happen automatically.
      const runOverdueSweep = async () => {
        try {
          const { workspaces: workspacesTable } = await import('@shared/schema');
          const { db: database } = await import('./db');
          const { eq } = await import('drizzle-orm');
          const activeWorkspaces = await database
            .select({ id: workspacesTable.id })
            .from(workspacesTable)
            .where(eq(workspacesTable.subscriptionStatus, 'active'));

          const { processDelinquentInvoices } = await import('./services/billingAutomation');
          let processed = 0;
          for (const ws of activeWorkspaces) {
            try {
              await processDelinquentInvoices(ws.id);
              processed++;
            } catch (wsErr: unknown) {
              log.warn('[OverdueSweep] Workspace sweep failed (non-fatal)', {
                workspaceId: ws.id,
                error: wsErr instanceof Error ? wsErr.message : String(wsErr),
              });
            }
          }
          log.info(`[OverdueSweep] Daily invoice overdue sweep complete — ${processed}/${activeWorkspaces.length} workspaces processed`);
        } catch (sweepErr: unknown) {
          log.warn('[OverdueSweep] Daily invoice sweep failed (non-fatal)', {
            error: sweepErr instanceof Error ? sweepErr.message : String(sweepErr),
          });
        }
      };

      // Run once at startup to catch any invoices that became overdue during downtime
      runOverdueSweep();
      // Then run every 24 hours
      setInterval(runOverdueSweep, 24 * 60 * 60 * 1000).unref();
      log.info('Invoice Overdue Sweep Scheduler initialized — daily delinquency scan active (24h cycle)');
    }),
  ]);
  
  // Log timing for extended services
  results.forEach((result) => {
    if (result.status === 'fulfilled' && !result.value.success) {
      log.warn(`${result.value.name} FAILED`, { error: result.value.error });
    }
  });
}

// ============================================================================
// PHASE 4: BACKGROUND SERVICES (runs async, non-blocking)
// ============================================================================
async function initializeBackgroundServices(): Promise<void> {
  // Warm feature flag cache early to prevent cold-start DB timeouts
  try {
    const { trinityRuntimeFlagsService } = await import('./services/featureFlagsService');
    await trinityRuntimeFlagsService.warmCache();
  } catch (e) {
    log.warn('Feature flag cache warm failed, continuing', { error: e instanceof Error ? { message: e.message } : String(e) });
  }
  
  // These run in the background without blocking
  const backgroundTasks = [
    timedInit('Service Watchdog', async () => {
      const { initializeServiceWatchdog } = await import('./services/ai-brain/serviceOrchestrationWatchdog');
      await initializeServiceWatchdog();
      log.info('Service Orchestration Watchdog initialized');
    }),
    
    timedInit('Cleanup Agent Subagent', async () => {
      const { registerCleanupAgentActions } = await import('./services/ai-brain/cleanupAgentSubagent');
      registerCleanupAgentActions();
      log.info('Cleanup Agent Subagent initialized - spec-index.json active');
    }),
    
    deferredTimedInit('Group 5 DB Tables', 500, async () => {
      const { initGroup5Tables } = await import('./services/g5TableInit');
      await initGroup5Tables();
      log.info('Group 5 tables initialized (35B–35F: sales_leads, work_orders, patrol_tours, officer_availability, shift_trade_requests, chat_bot_commands)');
    }),

    deferredTimedInit('Q1 2026 Infrastructure Services', 3000, async () => {
      const { initializeInfrastructureServices } = await import('./services/infrastructure/index');
      await initializeInfrastructureServices();
      log.info('Q1 2026 Infrastructure Services initialized - job queue, backups, error tracking, key rotation');
    }),
    
    timedInit('Billing Orchestration', async () => {
      const { registerBillingOrchestrationActions } = await import('./services/partners/billingOrchestrationService');
      registerBillingOrchestrationActions();
      log.info('Billing Orchestration Service initialized - 99% automation / 1% oversight active');
    }),

    timedInit('Autonomous Scheduling Daemon', async () => {
      const { autonomousSchedulingDaemon } = await import('./services/scheduling/autonomousSchedulingDaemon');
      autonomousSchedulingDaemon.start({ runIntervalMinutes: 60, autoFillEnabled: true, templateGenerationEnabled: true, alertsEnabled: true, maxShiftsPerRun: 50 });
      registerDaemon('AutonomousSchedulingDaemon', () => autonomousSchedulingDaemon.stop());
      log.info('Autonomous Scheduling Daemon ACTIVE — running every 60 min, autoFill + templateGen + alerts enabled');
    }),

    // S14: Coverage Escalation — scans shift_coverage_requests for blown SLAs
    // and emits shift_calloff_escalated so org_owner/managers get paged.
    timedInit('Coverage Escalation Service', async () => {
      const { coverageEscalationService } = await import('./services/scheduling/coverageEscalationService');
      coverageEscalationService.start(5); // every 5 minutes
      registerDaemon('CoverageEscalationService', () => coverageEscalationService.stop());
      log.info('Coverage Escalation Service ACTIVE — scanning coverage SLA every 5 min');
    }),

    deferredTimedInit('Trinity Automation Bootstrap', 5000, async () => {
      const { automationTriggerService } = await import('./services/orchestration/automationTriggerService');
      // Bootstrap default triggers for every active workspace so invoices/payroll/scheduling
      // fire correctly even after a server restart or on workspaces with no QB connection.
      await automationTriggerService.bootstrapAllWorkspaces();
      // Start daily billing cron: runs generateWeeklyInvoices + delinquency sweep every 24h
      automationTriggerService.startDailyBillingCron();
      automationTriggerService.startPeriodicTriggerCrons();
      registerDaemon('TrinityAutomationTriggers', () => automationTriggerService.shutdown());
      // Sunday weekly report cron — fires report.weekly Trinity action for all workspaces every Sunday 8am UTC
      const { startWeeklyReportCron, stopWeeklyReportCron } = await import('./services/weeklyReportCronService');
      startWeeklyReportCron();
      registerDaemon('WeeklyReportCron', () => stopWeeklyReportCron());
      log.info('Trinity Automation Bootstrap complete - workspace triggers initialized, daily billing cron active, weekly report cron scheduled');
    }),

    timedInit('Orchestration Governance', async () => {
      const { registerOrchestrationGovernanceActions } = await import('./services/ai-brain/trinityOrchestrationGovernance');
      registerOrchestrationGovernanceActions();
      log.info('Trinity Orchestration Governance initialized - 99/1 pattern + hotpatch cadence active');
    }),
    
    timedInit('Thought Engine', async () => {
      const { registerThoughtEngineActions } = await import('./services/ai-brain/trinityThoughtEngine');
      registerThoughtEngineActions();
      log.info('Trinity Thought Engine initialized - metacognition active');
    }),
    
    timedInit('Approval Resume Orchestrator', async () => {
      const { approvalResumeOrchestrator, registerApprovalResumeActions } = await import('./services/ai-brain/approvalResumeOrchestrator');
      registerApprovalResumeActions();
      approvalResumeOrchestrator.start();
      registerDaemon('ApprovalResumeOrchestrator', () => approvalResumeOrchestrator.stop?.());
      log.info('Approval Resume Orchestrator initialized - email escalations active');
    }),
    
    timedInit('Agent Parity Layer', async () => {
      const { trinityAgentParityLayer } = await import('./services/ai-brain/trinityAgentParityLayer');
      const capabilities = trinityAgentParityLayer.getCapabilities();
      log.info('Trinity Agent Parity Layer initialized', { capabilities: capabilities.length });
    }),
    
    deferredTimedInit('Trinity Autonomous Ops', 5000, async () => {
      const { initializeTrinityAutonomousOps } = await import('./services/ai-brain/trinityAutonomousOps');
      await initializeTrinityAutonomousOps();
      log.info('Trinity Autonomous Operations initialized - proactive monitoring active');
    }),
    
    deferredTimedInit('Domain Ops Subagents', 5000, async () => {
      const { initializeDomainOpsSubagents } = await import('./services/ai-brain/subagents/domainOpsSubagents');
      await initializeDomainOpsSubagents();
      log.info('Domain Ops Subagents initialized - SchemaOps, LogOps, HandlerOps, HookOps active');
    }),
    
    deferredTimedInit('Trinity Self-Awareness', 7000, async () => {
      const { initializeTrinitySelfAwareness } = await import('./services/ai-brain/trinitySelfAwarenessService');
      await initializeTrinitySelfAwareness();
      log.info('Trinity Self-Awareness Service initialized');
    }),
    
    deferredTimedInit('Gap Intelligence', 9000, async () => {
      const { initializeGapIntelligence, stopGapIntelligence } = await import('./services/ai-brain/gapIntelligenceService');
      await initializeGapIntelligence();
      if (typeof stopGapIntelligence === 'function') {
        registerDaemon('GapIntelligence', stopGapIntelligence);
      }
      log.info('Gap Intelligence Service initialized - scheduled scans active');
    }),
    
    deferredTimedInit('Workflow Approval', 9000, async () => {
      const { initializeWorkflowApproval } = await import('./services/ai-brain/workflowApprovalService');
      await initializeWorkflowApproval();
      log.info('Workflow Approval Service initialized - UNS prompts active');
    }),
    
    deferredTimedInit('Trial Conversion', 11000, async () => {
      const { initializeTrialConversionOrchestrator } = await import('./services/billing/trialConversionOrchestrator');
      await initializeTrialConversionOrchestrator();
      log.info('Trial Conversion Orchestrator initialized');
    }),

    deferredTimedInit('Voice Session Cleanup', 12000, async () => {
      const { initializeVoiceSessionCleanup } = await import('./services/trinityVoice/voiceSessionCleanup');
      initializeVoiceSessionCleanup();
    }),
    
    deferredTimedInit('Stripe Event Bridge', 11000, async () => {
      const { initializeStripeEventBridge } = await import('./services/billing/stripeEventBridge');
      await initializeStripeEventBridge();
      log.info('Stripe Event Bridge initialized');
    }),
    
    deferredTimedInit('Exception Queue Processor', 11000, async () => {
      const { initializeExceptionQueueProcessor } = await import('./services/billing/exceptionQueueProcessor');
      await initializeExceptionQueueProcessor();
      log.info('Exception Queue Processor initialized');
    }),

    timedInit('Shift Bot Action Registry', async () => {
      const { registerShiftBotActions } = await import('./services/bots/shiftBotActionRegistry');
      registerShiftBotActions();
    }),

    timedInit('Permission Management Actions', async () => {
      const { registerPermissionManagementActions } = await import('./services/rbac/permissionManagementActions');
      registerPermissionManagementActions();
    }),
    
    timedInit('Weekly Billing Run', async () => {
      const { initializeWeeklyBillingRunService } = await import('./services/billing/weeklyBillingRunService');
      initializeWeeklyBillingRunService();
      log.info('Weekly Billing Run Service initialized - 4 actions registered');
    }),

    deferredTimedInit('Client Invoice Auto-Generation', 15000, async () => {
      const { runScheduledClientInvoiceAutoGeneration } = await import('./services/timesheetInvoiceService');
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const runCycle = async () => {
        try {
          await runScheduledClientInvoiceAutoGeneration();
          log.info('Client Invoice Auto-Generation: weekly cycle complete');
        } catch (err: any) {
          log.error('Client Invoice Auto-Generation: cycle failed', { error: err?.message });
        }
      };
      await runCycle();
      setInterval(runCycle, SEVEN_DAYS_MS).unref();
      log.info('Client Invoice Auto-Generation scheduled — runs every 7 days');
    }),

    deferredTimedInit('Autonomous Fix Pipeline', 9000, async () => {
      const { initializeAutonomousFixPipeline } = await import('./services/ai-brain/autonomousFixPipeline');
      await initializeAutonomousFixPipeline();
      log.info('Autonomous Fix Pipeline initialized - self-healing active');
    }),
    
    deferredTimedInit('Agent Spawning System', 6000, async () => {
      const { initializeAgentSpawner } = await import('./services/ai-brain/agentSpawner');
      await initializeAgentSpawner();
      log.info('Agent Spawning System initialized — 3 tables, 7 default agents seeded');
    }),

    deferredTimedInit('AI Brain Action Registry', 7000, async () => {
      const { aiBrainActionRegistry } = await import('./services/ai-brain/actionRegistry');
      await aiBrainActionRegistry.initialize();
      const { helpaiOrchestrator } = await import('./services/helpai/platformActionHub');
      const counts = helpaiOrchestrator.getActionCountByCategory();
      log.info('Action categories', { counts });
      // Registry invariant check — warns if over 300 actions or duplicate IDs
      helpaiOrchestrator.assertRegistryInvariants();
    }),
    
    deferredTimedInit('Workflow Orchestration', 7000, async () => {
      const { initializeOrchestrationServices: initWorkflowOrchestration } = await import('./services/orchestration/index');
      await initWorkflowOrchestration();
      log.info('Workflow Orchestration Services initialized - 33 actions registered');
    }),
    
    timedInit('HRIS Integration Service', async () => {
      const { hrisIntegrationService } = await import('./services/hris/hrisIntegrationService');
      const { helpaiOrchestrator } = await import('./services/helpai/platformActionHub');
      const actions = hrisIntegrationService.getAIBrainActions();
      for (const action of actions) {
        helpaiOrchestrator.registerAction({
          actionId: action.name,
          name: action.name.replace('hris.', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          category: 'integrations' as const,
          description: action.description,
          requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner'],
          handler: async (request: any) => {
            const startTime = Date.now();
            try {
              const result = await action.handler(request.payload || {});
              return {
                success: result.success,
                actionId: request.actionId,
                message: result.success ? `HRIS action ${action.name} completed` : 'HRIS action failed',
                data: result,
                executionTimeMs: Date.now() - startTime,
              };
            } catch (error: any) {
              return {
                success: false,
                actionId: request.actionId,
                message: error.message,
                executionTimeMs: Date.now() - startTime,
              };
            }
          },
        });
      }
      log.info('HRIS Integration Service initialized', { actionsRegistered: actions.length });
    }),
    
    timedInit('Notification Cleanup Scheduler', async () => {
      startNotificationCleanupScheduler();
      log.info('Notification cleanup scheduler started');
    }),
    timedInit('Token Cleanup Scheduler', async () => {
      initTokenCleanupScheduler();
      log.info('Token cleanup scheduler started');
    }),
    
    deferredTimedInit('Employee Role Sync Service', 13000, async () => {
      const { employeeRoleSyncService } = await import('./services/employeeRoleSyncService');
      await employeeRoleSyncService.initialize();
      log.info('Employee Role Sync Service initialized - auto role assignment active');
    }),
    
    deferredTimedInit('Cross-Device Sync Service', 13000, async () => {
      const { crossDeviceSyncService } = await import('./services/crossDeviceSyncService');
      await crossDeviceSyncService.initialize();
      log.info('Cross-Device Sync Service initialized - mobile/desktop sync active');
    }),
    
    timedInit('Trinity Bot Ecosystem', async () => {
      const { BOT_REGISTRY, botPool } = await import('./bots/index');
      const { documentPipeline } = await import('./pipeline/index');
      log.info('Trinity Bot Ecosystem initialized', { bots: Object.keys(BOT_REGISTRY).length });
    }),
  ];
  
  // Run all background tasks in parallel
  const results = await Promise.allSettled(backgroundTasks);
  
  // Log summary
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
  const totalTime = results
    .filter(r => r.status === 'fulfilled')
    .reduce((sum, r) => sum + (r as PromiseFulfilledResult<any>).value.duration, 0);
  
  const maxDuration = Math.max(...results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value.duration));
  
  results.forEach(r => {
    if (r.status === 'fulfilled' && !r.value.success) {
      log.warn('Background service failed to initialize', { service: r.value.name, error: r.value.error });
    }
  });
  
  log.info('Background services initialization complete', { successful, total: backgroundTasks.length, failed, maxDurationMs: maxDuration });
}

// ============================================================================
// DAEMON REGISTRY — tracks all background services for graceful shutdown
// ============================================================================
const daemonRegistry: Array<{ name: string; stop: () => void | Promise<void> }> = [];

export function registerDaemon(name: string, stop: () => void | Promise<void>): void {
  daemonRegistry.push({ name, stop });
}

// ============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================================================
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    log.info('Already shutting down, ignoring signal', { signal });
    return;
  }
  isShuttingDown = true;
  
  log.info('Received signal, starting graceful shutdown', { signal });
  
  for (const daemon of daemonRegistry) {
    try {
      await daemon.stop();
      log.info(`Daemon stopped: ${daemon.name}`);
    } catch (e) {
      log.warn(`Failed to stop daemon ${daemon.name}`, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    const { trinityAnomalyDetector } = await import('./services/ai-brain/trinityAnomalyDetector');
    trinityAnomalyDetector.stop();
    log.info('Trinity Anomaly Detector stopped');
  } catch (e) {
    // Non-critical — detector may not have started
  }

  try {
    const { trinityScheduledScans } = await import('./services/ai-brain/trinityScheduledScans');
    trinityScheduledScans.stop();
    log.info('Trinity Scheduled Scans stopped');
  } catch (e) {
    // Non-critical — may not have started
  }

  // Close HTTP server first with timeout
  if (serverInstance) {
    await new Promise<void>((resolve) => {
      const shutdownTimeout = setTimeout(() => {
        log.warn('HTTP server close timeout, forcing');
        resolve();
      }, 5000);
  // Close WebSocket connections
  const globalWithWss = globalThis as typeof globalThis & { wss?: { close?: (cb?: () => void) => void } };
  if (globalWithWss.wss && typeof globalWithWss.wss.close === 'function') {
    try {
      globalWithWss.wss.close(() => {
        log.info('WebSocket server closed');
      });
    } catch (e) {
      log.error('Error closing WebSocket server', { error: e instanceof Error ? { message: e.message } : String(e) });
    }
  }
  
  // Clean up event listeners
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
  
  // Clear all timers
  // Note: This could be aggressive - only clear non-core timers in production
  if (global.gc) {
    log.info('Running garbage collection');
    global.gc();
  }
      
      serverInstance.close(() => {
        clearTimeout(shutdownTimeout);
        log.info('HTTP server closed');
        resolve();
      });
    });
  }
  
  // Close database connections
  try {
    await pool.end();
    log.info('Database connections closed');
  } catch (e) {
    log.error('Error closing database', { error: e instanceof Error ? { message: e.message, stack: e.stack } : String(e) });
  }
  
  // Remove lock file
  removeLockFile();
  
  log.info('Graceful shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Handle uncaught exceptions - be resilient to Neon serverless errors
process.on('uncaughtException', (err: any) => {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? (err.stack || '').split('\n').slice(0,5).join(' | ') : '';
  log.error(`Uncaught exception: ${errMsg} | code=${err?.code || 'none'} | ${errStack.slice(0,200)}`);
  
  if (err.message?.includes('Cannot set property message') && 
      err.message?.includes('ErrorEvent')) {
    log.warn('Neon serverless library error (non-fatal), continuing');
    return;
  }
  
  if (err.code === '57P01' || err.message?.includes('terminating connection due to administrator command')) {
    log.warn('Database connection terminated by administrator (non-fatal), continuing');
    return;
  }
  
  if (errMsg?.includes('column "date" does not exist') || errMsg?.includes("column 'date' does not exist")) {
    log.warn('platform_updates.date column missing (non-fatal) — migration will add it');
    return;
  }
  
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.message?.includes('Connection terminated unexpectedly')) {
    log.warn('Database connection reset (non-fatal), continuing');
    return;
  }
  
  removeLockFile();
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise) => {
  const reasonStr = String(reason);
  if (reasonStr.includes('timeout') || reasonStr.includes('connection') || 
      reasonStr.includes('57P01') || reasonStr.includes('terminating connection') ||
      reasonStr.includes('ECONNRESET') || reasonStr.includes('EPIPE')) {
    log.warn('Unhandled rejection (connection issue, non-fatal)', { reason: reasonStr.slice(0, 200) });
    return;
  }
  log.error('Unhandled rejection', { reason: reasonStr.slice(0, 500) });
});

// ============================================================================
// MAIN STARTUP SEQUENCE
// ============================================================================
(async () => {
  const startupStart = Date.now();
  let server;

  // ── EARLIEST CRITICAL MIGRATION ─────────────────────────────────────────────
  // Must run before ANYTHING — Phase 0 route registration fires background tasks
  // that immediately insert to platform_updates with the 'date' column.
  // Running here (before Phase 0, before bindToPort) eliminates the race condition.
  try {
    const { pool: earlyPool } = await import('./db');
    await earlyPool.query(`ALTER TABLE platform_updates ADD COLUMN IF NOT EXISTS date TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
    await earlyPool.query(`ALTER TABLE platform_updates ALTER COLUMN date DROP NOT NULL`);
  } catch (e: any) {
    // Non-fatal: table may not exist yet (first boot) or column already exists
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Port is cleaned up right before server.listen() for maximum reliability
  const port = parseInt(process.env.PORT || '5000', 10);

  // Environment validation — comprehensive check of critical and billing vars
  validateEnvironment();

  // Architecture lint — non-blocking, just warns about violations
  runArchitectureLint();

  // EMERGENCY: Add SW-killer and static-bypass BEFORE any auth middleware
  // These routes must be accessible without authentication — they're needed
  // to break the service worker cache loop that causes the black screen.
  
  // /clear-sw → forces browser to unregister all service workers
  app.get('/clear-sw', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.navigate(c.url));
});
`);
  });

  // /sw-health → returns JSON so browser can check if server is alive
  app.get('/sw-health', (_req: any, res: any) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ts: Date.now() });
  });

  // PHASE 0: Register routes (required before anything else)
  // ── EARLY STATIC FILE SERVING (CRITICAL — must run BEFORE registerRoutes) ──
  // This ensures GET / and all client-side routes return HTML before any API
  // middleware can intercept them. API routes (/api/*) are still handled by
  // registerRoutes() below — express.static skips them automatically.
  const path = await import('path');
  const fs = await import('fs');
  const distPath = path.default.resolve(process.cwd(), 'dist/public');
  if (fs.default.existsSync(distPath)) {
    const expressStaticMod = await import('express');
    const expressStatic = expressStaticMod.default.static;
    // Serve sw.js with no-cache so browser always gets latest version
    app.get('/sw.js', (_req: any, res: any) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Content-Type', 'application/javascript');
      res.sendFile(path.default.resolve(distPath, 'sw.js'));
    });
    // Serve static assets (JS, CSS, images) — skips /api/* routes automatically
    app.use(expressStatic(distPath, { index: false }));
    // SPA catch-all: serve index.html for all non-API navigation requests
    app.get('*', (req: any, res: any, next: any) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
        return next();
      }
      // Only intercept navigation requests (browser GET for pages)
      const accept = req.headers.accept || '';
      if (accept.includes('text/html') || accept === '*/*' || !req.path.includes('.')) {
        return res.sendFile(path.default.resolve(distPath, 'index.html'));
      }
      next();
    });
    log.info('[Startup] Early static serving registered — SPA routes handled before API middleware');
  } else {
    // dist/public not built yet — serve placeholder for all non-API routes
    app.get('*', (req: any, res: any, next: any) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) return next();
      res.status(200).send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CoAIleague</title></head><body style="margin:0;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui"><div style="text-align:center"><h1 style="color:#7c3aed">CoAIleague</h1><p>Deploying... <button onclick="location.reload()" style="background:#7c3aed;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer">Reload</button></p></div><script>setTimeout(()=>location.reload(),15000)</script></body></html>');
    });
    log.warn('[Startup] dist/public not found — static serving in fallback mode');
  }

  try {
    log.info('Phase 0: Registering routes');
    server = await registerRoutes(app);
    registerDaemon('DecemberHolidayCron', stopDecemberHolidayCron);
    registerDaemon('BackupVerificationCron', stopBackupVerificationCron);
    registerDaemon('StatusHealthLoop', stopStatusHealthLoop);

    // ── Semantic alias routes ────────────────────────────────────────────────
    // These provide canonical paths expected by the audit / frontend without
    // duplicating logic — they proxy to existing route handlers or query DB.

    // Trinity pending-approvals alias (actual handler lives in automationGovernanceRoutes)
    app.get('/api/trinity/pending-approvals', requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
      const wid = req.workspaceId || req.query.workspaceId;
      if (!wid) return res.status(400).json({ error: 'workspaceId required' });
      try {
        const { rows } = await pool.query(
          `SELECT id, workspace_id, action_type, status, parameters, reason, created_at, expires_at
           FROM governance_approvals
           WHERE workspace_id = $1 AND status = 'pending'
           ORDER BY created_at DESC LIMIT 50`,
          [wid]
        );
        res.json({ success: true, approvals: rows, count: rows.length });
      } catch (err: any) {
        log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Trinity — idempotent approve endpoint with execution-after-approve.
    // Atomic UPDATE gates by status + execution_locked + expires_at so a
    // second tap cannot duplicate execution. Distinct 4xx per failure mode
    // so the UI can explain exactly what happened. On successful approval
    // we schedule a non-blocking executor that runs the action via
    // helpaiOrchestrator and records completion / broadcast.
    app.post('/api/trinity/pending-approvals/:id/approve', requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
      const wid = req.workspaceId || req.body?.workspaceId || req.query.workspaceId;
      const { id } = req.params;
      const userId = req.user?.id || req.user?.userId || 'unknown';
      const userRole = req.user?.role || req.workspaceRole || 'manager';
      if (!wid) return res.status(400).json({ error: 'workspaceId required' });
      if (!id) return res.status(400).json({ error: 'approval id required' });

      // Manager-or-higher gate (layered on top of existing workspace scope)
      if (!['org_owner','co_owner','org_admin','org_manager','manager'].includes(userRole)) {
        return res.status(403).json({ error: 'Manager access required to approve Trinity actions' });
      }

      try {
        // Primary path — atomic idempotent UPDATE using the v2 columns.
        // Falls back gracefully when execution_locked / executed_by / executed_at
        // columns don't yet exist (schema migration not applied).
        let rows: any[] = [];
        try {
          const res1 = await pool.query(
            `UPDATE governance_approvals
                SET status = 'approved',
                    approvals = COALESCE(approvals, '[]'::jsonb) || $1::jsonb,
                    executed_by = $2,
                    executed_at = NOW(),
                    execution_locked = TRUE,
                    updated_at = NOW()
              WHERE id = $3
                AND workspace_id = $4
                AND status = 'pending'
                AND execution_locked = FALSE
                AND (expires_at IS NULL OR expires_at > NOW())
              RETURNING *`,
            [
              JSON.stringify([{ approvedBy: userId, role: userRole, at: new Date().toISOString() }]),
              userId, id, wid,
            ],
          );
          rows = res1.rows;
        } catch (schemaErr: any) {
          // Columns not present — fall back to v1 shape (id + workspace + pending)
          const res2 = await pool.query(
            `UPDATE governance_approvals
                SET status = 'approved',
                    approvals = COALESCE(approvals, '[]'::jsonb) || $1::jsonb,
                    updated_at = NOW()
              WHERE id = $2 AND workspace_id = $3 AND status = 'pending'
              RETURNING *`,
            [JSON.stringify([{ approvedBy: userId, role: userRole, at: new Date().toISOString() }]), id, wid],
          );
          rows = res2.rows;
        }

        if (!rows.length) {
          // Diagnose why no row was affected so UI can show precise message
          const { rows: existing } = await pool.query(
            `SELECT id, status, expires_at FROM governance_approvals
              WHERE id = $1 AND workspace_id = $2`,
            [id, wid],
          );
          if (!existing.length) return res.status(404).json({ error: 'Approval not found' });
          const record = existing[0];
          if (['approved', 'completed', 'executing'].includes(record.status)) {
            return res.status(409).json({
              error: 'already_processed',
              message: 'This action was already approved and has executed or is executing. No duplicate action will be taken.',
              status: record.status,
            });
          }
          if (record.status === 'rejected' || record.status === 'denied') {
            return res.status(409).json({ error: 'already_rejected', message: 'This action was already rejected.', status: record.status });
          }
          if (record.expires_at && new Date(record.expires_at) < new Date()) {
            return res.status(410).json({ error: 'expired', message: 'This approval request has expired.' });
          }
          return res.status(409).json({ error: 'cannot_approve', status: record.status });
        }

        const approval = rows[0];

        // Execute the approved action in background — non-blocking.
        scheduleNonBlocking('trinity.approval.execute', async () => {
          try {
            const { helpaiOrchestrator } = await import('./services/helpai/platformActionHub');
            const payload = typeof approval.parameters === 'string'
              ? JSON.parse(approval.parameters) : (approval.parameters || {});

            await pool.query(
              `UPDATE governance_approvals SET status = 'executing', updated_at = NOW() WHERE id = $1`,
              [id],
            ).catch(() => {});

            const result = await helpaiOrchestrator.executeAction({
              actionId: approval.action_type,
              category: (payload as any).category || 'system',
              name: approval.action_type,
              payload,
              workspaceId: wid,
              userId,
              userRole,
              metadata: { source: 'approval_queue', approvalId: id },
            });

            await pool.query(
              `UPDATE governance_approvals
                  SET status = $1, updated_at = NOW()
                WHERE id = $2`,
              [result.success ? 'completed' : 'failed', id],
            ).catch(() => {});

            try {
              broadcastToWorkspace(wid, {
                type: 'trinity_action_executed',
                approvalId: id,
                actionId: approval.action_type,
                success: result.success,
                message: result.message,
              });
            } catch { /* non-fatal */ }
          } catch (execErr: any) {
            await pool.query(
              `UPDATE governance_approvals SET status = 'failed', updated_at = NOW() WHERE id = $1`, [id],
            ).catch(() => {});
            log.error('[ApprovalExecute] Failed:', execErr?.message);
          }
        });

        res.json({ success: true, message: 'Action approved and queued for execution', approvalId: id, approval });
      } catch (err: any) {
        log.error('[Route] pending-approvals/approve internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Trinity — reject endpoint, mirrors approve safety.
    app.post('/api/trinity/pending-approvals/:id/reject', requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
      const wid = req.workspaceId || req.body?.workspaceId || req.query.workspaceId;
      const { id } = req.params;
      const userId = req.user?.id || req.user?.userId || 'unknown';
      const userRole = req.user?.role || req.workspaceRole || 'manager';
      const reason = (req.body?.reason || '').toString().slice(0, 500);
      if (!wid) return res.status(400).json({ error: 'workspaceId required' });
      if (!id) return res.status(400).json({ error: 'approval id required' });

      if (!['org_owner','co_owner','org_admin','org_manager','manager'].includes(userRole)) {
        return res.status(403).json({ error: 'Manager access required to reject Trinity actions' });
      }

      try {
        let rows: any[] = [];
        try {
          const res1 = await pool.query(
            `UPDATE governance_approvals
                SET status = 'rejected',
                    approvals = COALESCE(approvals, '[]'::jsonb) || $1::jsonb,
                    executed_by = $2,
                    executed_at = NOW(),
                    updated_at = NOW(),
                    reason = COALESCE(reason, '') || $3
              WHERE id = $4 AND workspace_id = $5 AND status = 'pending'
              RETURNING id, status`,
            [
              JSON.stringify([{ rejectedBy: userId, role: userRole, reason, at: new Date().toISOString() }]),
              userId,
              reason ? ` | Rejected: ${reason}` : '',
              id, wid,
            ],
          );
          rows = res1.rows;
        } catch {
          const res2 = await pool.query(
            `UPDATE governance_approvals
                SET status = 'rejected',
                    approvals = COALESCE(approvals, '[]'::jsonb) || $1::jsonb,
                    updated_at = NOW()
              WHERE id = $2 AND workspace_id = $3 AND status = 'pending'
              RETURNING id, status`,
            [JSON.stringify([{ rejectedBy: userId, reason: reason || 'No reason given', at: new Date().toISOString() }]), id, wid],
          );
          rows = res2.rows;
        }
        if (!rows.length) return res.status(409).json({ error: 'cannot_reject', message: 'Approval not pending or not found' });
        res.json({ success: true, approval: rows[0] });
      } catch (err: any) {
        log.error('[Route] pending-approvals/reject internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Trinity activity endpoint — recent Trinity actions for activity center
    app.get('/api/trinity/activity', requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
      const wid = req.workspaceId || req.query.workspaceId;
      if (!wid) return res.status(400).json({ error: 'workspaceId required' });
      try {
        const { rows } = await pool.query(
          `SELECT id, workspace_id, action_type, action_name, status, result, duration_ms, error_message, created_at
           FROM trinity_action_logs
           WHERE workspace_id = $1
           ORDER BY created_at DESC LIMIT 100`,
          [wid]
        );
        res.json({ success: true, activity: rows, count: rows.length });
      } catch (err: any) {
        log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Compliance dashboard alias
    app.get('/api/compliance/dashboard', requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
      const wid = req.workspaceId || req.query.workspaceId;
      if (!wid) return res.status(400).json({ error: 'workspaceId required' });
      try {
        const { rows: [summary] } = await pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE ec.expiration_date < NOW()) AS expired_licenses,
             COUNT(*) FILTER (WHERE ec.expiration_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_soon,
             COUNT(*) AS total_licenses
           FROM employee_certifications ec
           WHERE ec.workspace_id = $1`,
          [wid]
        );
        const { rows: violations } = await pool.query(
          `SELECT ec.certification_type, ec.certification_number, ec.expiration_date,
                  e.first_name || ' ' || e.last_name AS officer_name, e.employee_number
           FROM employee_certifications ec
           JOIN employees e ON e.id = ec.employee_id
           WHERE ec.workspace_id = $1 AND ec.expiration_date < NOW() + INTERVAL '30 days'
           ORDER BY ec.expiration_date ASC LIMIT 20`,
          [wid]
        );
        const expiredCount = Number(summary?.expired_licenses || 0);
        const expiringSoonCount = Number(summary?.expiring_soon || 0);
        const totalCount = Number(summary?.total_licenses || 1);
        const computedScore = Math.max(0, Math.round(100 - (expiredCount * 2 + expiringSoonCount) / Math.max(totalCount, 1) * 100));
        res.json({
          workspaceId: wid,
          complianceScore: computedScore,
          expiredLicenses: Number(summary?.expired_licenses || 0),
          expiringSoon: Number(summary?.expiring_soon || 0),
          totalLicenses: Number(summary?.total_licenses || 0),
          violations,
        });
      } catch (err: any) {
        log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Calloffs alias — shifts with calloff status + replacement cascade info
    app.get('/api/calloffs', requireAuth, ensureWorkspaceAccess, async (req: any, res: any) => {
      const wid = req.workspaceId || req.query.workspaceId;
      if (!wid) return res.status(400).json({ error: 'workspaceId required' });
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      try {
        const { rows } = await pool.query(
          `SELECT cr.id, cr.workspace_id, cr.original_shift_id, cr.reason, cr.status,
                  cr.shift_date, cr.shift_start_time, cr.shift_end_time, cr.created_at,
                  cr.current_tier, cr.accepted_at,
                  e.first_name || ' ' || e.last_name AS officer_name, e.employee_number
           FROM shift_coverage_requests cr
           LEFT JOIN employees e ON e.id = cr.original_employee_id
           WHERE cr.workspace_id = $1
           ORDER BY cr.created_at DESC
           LIMIT $2`,
          [wid, limit]
        );
        res.json({ success: true, data: rows, count: rows.length });
      } catch (err: any) {
        log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ── End semantic alias routes ────────────────────────────────────────────

    app.use('/api', notFoundHandler);
    app.use(globalErrorHandler);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    console.error('[FATAL] CRITICAL: Failed to register routes —', errMsg);
    if (errStack) console.error(errStack);
    log.error(`CRITICAL: Failed to register routes — ${errMsg}`, { stack: typeof errStack === 'string' ? errStack.slice(0, 500) : '' });
    process.exit(1);
  }

  // PHASE 0.4-0.7: Deferred to post-listen for faster startup (non-blocking)
  // Password migrations, production seed, data corrections run after server is accepting traffic

  // NOTE: Phase 1 (critical services) is now deferred to post-listen for Cloud Run compatibility.
  // The server must bind to its port within seconds of startup for Cloud Run health checks.

  // ========================================================================
  // BIND TO PORT FIRST — before Vite setup to minimize unreachable window
  // On Replit: skip lsof/test-bind (both create brief gaps), just retry on EADDRINUSE
  // On Cloud Run: bind immediately, no cleanup needed
  // ========================================================================
  serverInstance = server;

  const bindToPort = async (targetPort: number): Promise<void> => {
    const myPid = String(process.pid);

    // Step 1: Kill any previous instance using the PID lock file
    try {
      if (fs.existsSync(PORT_LOCK_FILE)) {
        const pid = fs.readFileSync(PORT_LOCK_FILE, 'utf8').trim();
        if (pid && pid !== myPid && !isNaN(parseInt(pid))) {
          log.info('Killing previous server process from lock file', { pid });
          try { execSync(`kill -15 ${pid} 2>/dev/null || true`, { stdio: 'ignore' }); } catch (e) { /* ignore */ }
          await new Promise(resolve => setTimeout(resolve, 400));
          try { execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: 'ignore' }); } catch (e) { /* ignore */ }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        try { fs.unlinkSync(PORT_LOCK_FILE); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }

    // Step 2: Try fuser as a fallback (works on some Replit environments)
    if (!IS_CLOUD_RUN) {
      try { execSync(`fuser -k ${targetPort}/tcp 2>/dev/null || true`, { stdio: 'ignore' }); } catch (e) { /* ignore */ }
    }

    // Step 3: Try to bind with retries — create fresh server per attempt to avoid stale state
    const MAX_ATTEMPTS = IS_CLOUD_RUN ? 1 : 10;
    const RETRY_DELAY_MS = 500;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const bound = await new Promise<boolean>((resolve) => {
        const onError = (err: NodeJS.ErrnoException) => {
          server.removeListener('error', onError);
          if (err.code === 'EADDRINUSE') {
            resolve(false);
          } else {
            // Non-EADDRINUSE errors are fatal
            log.error('Unexpected server error during bind', { error: err.message, code: err.code });
            resolve(false);
          }
        };
        server.once('error', onError);
        server.listen({ port: targetPort, host: "0.0.0.0" }, () => {
          server.removeListener('error', onError);
          resolve(true);
        });
      });

      if (bound) {
        createLockFile();
        return;
      }

      if (attempt < MAX_ATTEMPTS) {
        log.info('Port still in use, waiting before retry', { port: targetPort, attempt, maxAttempts: MAX_ATTEMPTS });
        // On even attempts, try fuser again
        if (attempt % 2 === 0 && !IS_CLOUD_RUN) {
          try { execSync(`fuser -k ${targetPort}/tcp 2>/dev/null || true`, { stdio: 'ignore' }); } catch (e) { /* ignore */ }
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    throw new Error(`Failed to bind to port ${targetPort} after ${MAX_ATTEMPTS} attempts`);
  };

  // Register static/frontend serving BEFORE opening the port so the deployment
  // health check at '/' gets a 200 on the very first request (not a 500 from
  // the port-forwarder hitting an unready backend).
  if (app.get("env") === "development") {
    // In dev, Vite needs the server reference — set up after bindToPort below.
  } else {
    // Production: crawler prerender then static files — both are pure middleware
    // registration (no I/O), so this adds <1 ms before the port opens.
    const { crawlerPrerenderMiddleware } = await import('./middleware/crawlerPrerender');
    app.use(crawlerPrerenderMiddleware);
    try {
      serveStatic(app);
      log.info('[Startup] Static files registered from dist/public/');
    } catch (staticErr: any) {
      // dist/public/ doesn't exist — Vite build didn't run or failed.
      // Register a fallback that serves a proper page instead of raw JSON.
      log.error('[Startup] serveStatic failed — dist/public/ not found. Vite build may have failed.', {
        error: staticErr?.message,
      });
      // Fallback: serve a bootstrap page for all non-API routes
      app.use('*', (req: any, res: any) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
          return res.status(503).json({ message: 'Service starting up', retry: true });
        }
        res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CoAIleague — Loading</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { text-align: center; padding: 2rem; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #7c3aed; }
    p { color: #94a3b8; margin-bottom: 1.5rem; }
    button { background: #7c3aed; color: white; border: none; padding: 0.75rem 2rem;
             border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>CoAIleague</h1>
    <p>The platform is deploying. This usually takes under 2 minutes.</p>
    <button onclick="window.location.reload()">Reload</button>
  </div>
  <script>setTimeout(() => window.location.reload(), 30000);</script>
</body>
</html>`);
      });
    }
  }

  try {
    await bindToPort(port);
  } catch (err: any) {
    log.error('Could not bind to port after all retries', { error: err.message, port });
    process.exit(1);
  }

  // Dev only: Vite HMR setup requires the bound server reference
  if (app.get("env") === "development") {
    const { crawlerPrerenderMiddleware } = await import('./middleware/crawlerPrerender');
    app.use(crawlerPrerenderMiddleware);
    const viteRouter = express.Router();
    await setupVite(viteRouter as any, server);
    
    // Guard: only pass to Vite if NOT an API or WebSocket route
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
        return next();
      }
      return viteRouter(req, res, next);
    });
  }
  
  // Server is now listening - run post-listen setup
  (async () => {
    const listenTime = Date.now() - startupStart;
    log.info('Server listening', { port, listenTimeMs: listenTime });
    
    viteLog(`serving on port ${port}`);

    // ── PRE-GRACE CRITICAL MIGRATION ─────────────────────────────────────────
    // Run before the grace period so HTTP requests during those 3s don't hit
    // missing columns. platform_updates.date must exist before any SELECT/INSERT.
    try {
      const { pool } = await import('./db');
      await pool.query(`ALTER TABLE platform_updates ADD COLUMN IF NOT EXISTS date TIMESTAMP WITH TIME ZONE DEFAULT NOW()`);
      log.info('[PreGrace] platform_updates.date column ensured');
    } catch (e: any) {
      log.warn('[PreGrace] platform_updates migration failed (non-fatal):', e.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // STARTUP GRACE: Brief pause for old TCP connections to drain before DB access
    await new Promise(resolve => setTimeout(resolve, 3000));
    log.info('Grace period complete — beginning Phase 1');

    // DB WAKE-UP: Wait for a successful SELECT 1 before loading Phase 1 services.
    // 10 attempts × 2s = 20s max wait. If DB is still down, proceed anyway — all
    // services guard against DB unavailability using the circuit breaker.
    {
      const { probeDbConnection } = await import('./db');
      let dbReady = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        const ok = await probeDbConnection();
        if (ok) {
          log.info(`Database ready (attempt ${attempt})`);
          dbReady = true;
          break;
        }
        log.warn(`Database probe attempt ${attempt}/10 failed. Retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      }
      if (!dbReady) {
        log.warn('Database unreachable after 10 attempts — starting in degraded mode (all services circuit-breaker protected)');
      }
    }

    // PHASE 1: Critical services — run in background so health check answers immediately
    // The DB bootstraps (constraints, indexes, identity) are idempotent and non-blocking.
    // If they fail, routes degrade gracefully via circuit-breaker — no 500 on first request.
    log.info('Phase 1: Critical services (background)');
    setImmediate(async () => {
      try {
        await initializeCriticalServices();
        log.info('Phase 1: Critical services complete');
      } catch (err: any) {
        log.error(`[CriticalServices] Failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    // Non-critical seeding tasks — fire-and-forget (do NOT block Phase 2+)
    void (async () => {
      // 5s stagger between each seeding task to avoid DB pile-up
      try {
        const { ensureSystemEntities } = await import('./services/productionSeed');
        await ensureSystemEntities();
      } catch (error) {
        log.error('System entities seed failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Applying schema patches');
        const { quickFixCommonColumns } = await import('./services/databaseParityScanner');
        await quickFixCommonColumns();
        log.info('Schema patches applied');
      } catch (error) {
        log.error('Schema patches failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      // Phase 39 — Performance indexes: ensure all FK/hot-path indexes exist (non-blocking CONCURRENTLY)
      try {
        await ensurePerformanceIndexes();
      } catch (error) {
        log.error('Performance index enforcement failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      // Phase 39 — NDS queue depth monitor: alert if pending jobs exceed 1000
      registerNdsQueueMonitor();

      // Ensure incident_flow_state column exists — added for DB-persistent bot state
      try {
        const { db: dbRef } = await import('./db');
        const { sql: sqlRef } = await import('drizzle-orm');
        await dbRef.execute(sqlRef`
          ALTER TABLE shift_chatrooms ADD COLUMN IF NOT EXISTS incident_flow_state JSONB
        `);
        log.info('Incident flow state column ensured');
      } catch (error) {
        log.error('Incident flow state column patch failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      // FIX [ORPHAN EXECUTION RECOVERY]: On every server start, mark any automation
      // executions that were left in 'queued' or 'in_progress' state from the previous
      // process as 'failed'. Without this, a server crash mid-automation leaves those
      // records stuck forever, cluttering dashboards and blocking valid retries.
      try {
        const { db: dbRef } = await import('./db');
        const { sql: sqlRef } = await import('drizzle-orm');
        const orphanResult = await dbRef.execute(sqlRef`
          UPDATE automation_executions
          SET status = 'failed',
              failure_reason = 'Server restarted — execution was orphaned mid-run',
              failure_code = 'SERVER_RESTART',
              completed_at = NOW(),
              updated_at = NOW()
          WHERE status IN ('queued', 'in_progress')
          AND queued_at < NOW() - INTERVAL '5 minutes'
        `);
        const count = (orphanResult as any).rowCount ?? 0;
        if (count > 0) {
          log.warn(`[ORPHAN RECOVERY] Marked ${count} orphaned automation execution(s) as failed on startup`);
        } else {
          log.info('[ORPHAN RECOVERY] No orphaned executions found on startup');
        }
      } catch (error) {
        log.error('Orphan execution recovery failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Running password migrations');
        await runPasswordMigrations();
      } catch (error) {
        log.error('Password migrations failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Running workspace health corrections');
        await runWorkspaceHealthCorrections();
      } catch (error) {
        log.error('Workspace health corrections failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Checking production database seed');
        // Production seed only runs when explicitly enabled
        if (process.env.SEED_ON_STARTUP === 'true') {
          const seedResult = await runProductionSeed();
          log.info('Production seed complete', { message: seedResult.message });
        }
      } catch (error) {
        log.error('Production seed check failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Running data corrections');
        await runDataCorrections();
        // Auto-create missing tables that may not exist yet
        try {
          const { pool: missingTablePool } = await import('./db');
          await missingTablePool.query(`CREATE TABLE IF NOT EXISTS ai_call_log (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            workspace_id VARCHAR, feature VARCHAR, model VARCHAR,
            tokens_used INTEGER DEFAULT 0, cost_credits INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )`);
          await missingTablePool.query(`CREATE TABLE IF NOT EXISTS universal_audit_log (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            workspace_id VARCHAR, actor_type VARCHAR DEFAULT 'system',
            actor_id VARCHAR, action VARCHAR NOT NULL,
            entity_type VARCHAR, entity_id VARCHAR,
            change_type VARCHAR DEFAULT 'action',
            metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
          )`);
          await missingTablePool.query('CREATE INDEX IF NOT EXISTS idx_ai_call_log_ws ON ai_call_log (workspace_id)');
          await missingTablePool.query('CREATE INDEX IF NOT EXISTS idx_univ_audit_ws ON universal_audit_log (workspace_id, created_at)');
          log.info('[Startup] Auto-created missing tables: ai_call_log, universal_audit_log');
        // Auto-create core auth tables that may be missing
        try {
          const { pool: authPool } = await import('./db');
          await authPool.query(`CREATE TABLE IF NOT EXISTS auth_tokens (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            token_hash VARCHAR NOT NULL,
            token_type VARCHAR DEFAULT 'session',
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            revoked_at TIMESTAMPTZ
          )`);
          await authPool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            session_id VARCHAR,
            ip_address VARCHAR,
            user_agent TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            revoked_at TIMESTAMPTZ
          )`);
          await authPool.query('CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens (user_id)');
          await authPool.query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id)');
          log.info('[Startup] Auth tables verified: auth_tokens, auth_sessions');
        } catch (authTableErr: any) {
          log.warn('[Startup] Auth table create (non-fatal):', authTableErr?.message?.slice(0, 80));
        }
        } catch (tableErr: any) {
          log.warn('[Startup] Missing table auto-create (non-fatal):', tableErr?.message?.slice(0, 80));
        }
        // Reset demo account locks in non-production (dev/staging Railway environments)
        const { resetDemoAccountLocks } = await import('./services/productionSeed');
        await resetDemoAccountLocks();
      } catch (error) {
        log.error('Data corrections failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Running production data cleanup');
        await runProductionDataCleanup();
      } catch (error) {
        log.error('Production data cleanup failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        log.info('Deferred: Seeding state regulatory knowledge base');
        if (process.env.SEED_ON_STARTUP === 'true') {
          const { seedStateKnowledgeBase } = await import('./services/compliance/stateRegulatoryKnowledgeBase');
          await seedStateKnowledgeBase();
        }
        log.info('State regulatory knowledge base seeded');
      } catch (error) {
        log.error('State knowledge base seed failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        log.info('Deferred: Phase 48 — Onboarding task migration');
        const { runOnboardingTaskMigration } = await import('./startup/onboardingTaskMigration');
        await runOnboardingTaskMigration();
        log.info('Phase 48 onboarding task migration complete');
      } catch (error) {
        log.error('Onboarding task migration failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
      }
    })().catch((err: any) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`[PostListen] Unhandled crash: ${msg}`);
    });

    // PHASE 2: Initialize AI Brain core (parallel, after listen)
    log.info('Phase 2: AI Brain core services (parallel)');
    await initializeAIBrainCore();
    
    // Stagger: let pool recover between phases (reduced from 2000ms for faster startup)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // PHASE 3: Initialize extended services (parallel)
    log.info('Phase 3: Extended services (parallel)');
    await initializeExtendedServices();
    
    // Stagger: let pool recover before background intervals start (reduced from 2000ms)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // PHASE 4: Background services (parallel, non-blocking feel)
    log.info('Phase 4: Background services (parallel)');
    await initializeBackgroundServices();
    
    // PHASE 5: Start autonomous scheduler
    log.info('Phase 5: Autonomous scheduler');
    try {
      startAutonomousScheduler();
      log.info('Autonomous scheduler started successfully');
    } catch (error) {
      log.error('CRITICAL: Failed to start autonomous scheduler', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }
    
    // PHASE 6: Initialize Trinity event subscriptions
    log.info('Phase 6: Trinity event subscriptions');
    try {
      initializeTrinityEventSubscriptions();
      log.info('Trinity event subscriptions initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Trinity event subscriptions', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6b: Initialize compliance scoring bridge
    try {
      complianceScoringBridge.initialize();
      log.info('Compliance scoring bridge initialized');
    } catch (error) {
      log.error('Failed to initialize compliance scoring bridge', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6c: Initialize Trinity Field Intelligence — all field operations reach Trinity
    try {
      const { trinityFieldIntelligence } = await import('./services/trinity/trinityFieldIntelligence');
      trinityFieldIntelligence.initialize();
      log.info('Trinity Field Intelligence initialized — RMS, CAD, GPS, Panic all connected to Trinity brain');
    } catch (error) {
      log.error('Failed to initialize Trinity Field Intelligence', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6c-ops: Initialize Ops domain backing services — registers Trinity safety/emergency/postorders/external actions
    try {
      const { panicAlertService } = await import('./services/ops/panicAlertService');
      const { loneWorkerService } = await import('./services/ops/loneWorkerService');
      const { boloService } = await import('./services/ops/boloService');
      const { visitorLogService } = await import('./services/ops/visitorLogService');
      const { assetTrackingService } = await import('./services/ops/assetTrackingService');
      const { weaponCheckService } = await import('./services/ops/weaponCheckService');
      const { lostFoundService } = await import('./services/ops/lostFoundService');
      panicAlertService.initialize();
      loneWorkerService.initialize();
      boloService.initialize();
      visitorLogService.initialize();
      assetTrackingService.initialize();
      weaponCheckService.initialize();
      lostFoundService.initialize();
      log.info('Ops domain backing services initialized — 14+ Trinity safety/emergency/postorders/external actions registered');
    } catch (error) {
      log.error('Failed to initialize ops domain backing services', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6d: Initialize Trinity Proactive Anomaly Detection
    try {
      const { trinityAnomalyDetector } = await import('./services/ai-brain/trinityAnomalyDetector');
      trinityAnomalyDetector.start();
      log.info('Trinity Anomaly Detector initialized — proactive anomaly detection active');
    } catch (error) {
      log.error('Failed to initialize Trinity Anomaly Detector', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6e-pre: Initialize Trinity Scheduled Multi-Org Scans (daily/weekly/monthly)
    try {
      const { trinityScheduledScans } = await import('./services/ai-brain/trinityScheduledScans');
      trinityScheduledScans.start();
      log.info('Trinity Scheduled Scans initialized — multi-org daily/weekly/monthly automation active');
    } catch (error) {
      log.error('Failed to initialize Trinity Scheduled Scans', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6e-helpai: Initialize HelpAI Proactive Monitor (5-minute per-workspace loop)
    try {
      const { helpAIProactiveMonitor } = await import('./services/helpai/helpAIProactiveMonitor');
      helpAIProactiveMonitor.start();
      registerDaemon('HelpAIProactiveMonitor', () => helpAIProactiveMonitor.stop?.());
      log.info('HelpAI Proactive Monitor initialized — 5-minute per-workspace loop active');
    } catch (error) {
      log.error('Failed to initialize HelpAI Proactive Monitor', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 64 — Trinity Resolution Fabric: autonomous issue resolution backbone
    try {
      const { trinityResolutionFabric } = await import('./services/ai-brain/trinityResolutionFabric');
      const { helpaiOrchestrator } = await import('./services/helpai/platformActionHub');

      // Register Trinity Resolution Fabric platform actions
      helpaiOrchestrator.registerAction({
        actionId: 'trinity.resolve_issue',
        name: 'Trinity Resolve Issue',
        category: 'support',
        description: 'Trinity autonomously resolves any detected operational issue — shift coverage, compliance, notifications, account access, financial anomalies.',
        requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'trinity_system'],
        handler: async (request: any) => {
          const startTime = Date.now();
          const issue = request.payload?.issue;
          if (!issue?.type || !issue?.workspaceId) {
            return { success: false, actionId: request.actionId, message: 'Missing required fields: issue.type, issue.workspaceId', data: null, executionTimeMs: 0 };
          }
          const result = await trinityResolutionFabric.resolve(issue);
          return {
            success: result.resolved,
            actionId: request.actionId,
            message: result.trinityMessage,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });

      helpaiOrchestrator.registerAction({
        actionId: 'trinity.resolve_batch',
        name: 'Trinity Resolve Issue Batch',
        category: 'support',
        description: 'Trinity resolves multiple detected issues in parallel across a workspace.',
        requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'trinity_system'],
        handler: async (request: any) => {
          const startTime = Date.now();
          const issues = request.payload?.issues;
          if (!Array.isArray(issues) || issues.length === 0) {
            return { success: false, actionId: request.actionId, message: 'Missing required field: issues (array)', data: null, executionTimeMs: 0 };
          }
          const result = await trinityResolutionFabric.resolveAll(issues);
          return {
            success: result.resolved > 0,
            actionId: request.actionId,
            message: `Trinity resolved ${result.resolved} of ${issues.length} issues. ${result.escalated} escalated to humans.`,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });

      log.info('Trinity Resolution Fabric initialized — 99% autonomous resolution active (immediate/delegated/supervised/escalated tiers)');
    } catch (error) {
      log.error('Failed to initialize Trinity Resolution Fabric', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 64 — Trinity Deliberation Loop: structured reasoning for complex issues
    try {
      const { trinityDeliberationLoop } = await import('./services/ai-brain/trinityDeliberationLoop');
      const { helpaiOrchestrator } = await import('./services/helpai/platformActionHub');

      helpaiOrchestrator.registerAction({
        actionId: 'trinity.deliberate',
        name: 'Trinity Deliberate',
        category: 'support',
        description: 'Trinity runs a full PERCEIVE → REASON → ACT → VERIFY → LEARN deliberation cycle for complex operational issues.',
        requiredRoles: ['root_admin', 'deputy_admin', 'sysop', 'trinity_system'],
        handler: async (request: any) => {
          const startTime = Date.now();
          const issue = request.payload?.issue;
          if (!issue?.type || !issue?.workspaceId) {
            return { success: false, actionId: request.actionId, message: 'Missing required fields: issue.type, issue.workspaceId', data: null, executionTimeMs: 0 };
          }
          const decision = await trinityDeliberationLoop.deliberate(issue);
          return {
            success: true,
            actionId: request.actionId,
            message: `Trinity deliberated: ${decision.recommendedTier} (confidence=${(decision.confidence * 100).toFixed(0)}%) — ${decision.reasoning}`,
            data: decision,
            executionTimeMs: Date.now() - startTime,
          };
        },
      });

      log.info('Trinity Deliberation Loop initialized — PERCEIVE/REASON/ACT/VERIFY/LEARN cycle active');
    } catch (error) {
      log.error('Failed to initialize Trinity Deliberation Loop', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6e: Initialize Escalation Chain persistence + rehydration
    try {
      const { escalationChainService } = await import('./services/trinityStaffing/escalationChainService');
      await escalationChainService.initialize();
      log.info('Escalation Chain Service initialized — DB persistence and tier advancement active');
    } catch (error) {
      log.error('Failed to initialize Escalation Chain Service', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6f: Plaid ACH Transfer Monitor
    try {
      const { startPayrollTransferMonitor, stopPayrollTransferMonitor } = await import('./services/payrollTransferMonitor');
      startPayrollTransferMonitor();
      registerDaemon('PayrollTransferMonitor', stopPayrollTransferMonitor);
      log.info('Payroll Transfer Monitor started — polling Plaid ACH transfer status every 5 minutes');
    } catch (error) {
      log.error('Failed to start Payroll Transfer Monitor', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6g: Autonomous Shift Monitoring Daemon + Coverage Pipeline
    // Critical: must auto-start at boot so uncovered shifts and late clock-ins are caught
    // without requiring manual API activation after every server restart.
    try {
      const { shiftMonitoringService } = await import('./services/automation/shiftMonitoringService');
      await shiftMonitoringService.start();
      registerDaemon('ShiftMonitoringService', () => shiftMonitoringService.stop());
      log.info('ShiftMonitoringService started — autonomous shift monitoring active (late clock-ins, NCNS, coverage gaps)');
    } catch (error) {
      log.error('Failed to start ShiftMonitoringService', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 6h: Coverage Pipeline daemon — staffing gap detection and autonomous fill requests
    try {
      const { coveragePipeline } = await import('./services/automation/coveragePipeline');
      await coveragePipeline.start();
      registerDaemon('CoveragePipeline', () => coveragePipeline.stop());
      log.info('CoveragePipeline started — autonomous coverage gap detection and officer invitation active');
    } catch (error) {
      log.error('Failed to start CoveragePipeline', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    // PHASE 8: Notification Delivery Retry Daemon
    // Processes retryable notifications every 60 seconds and checks WebSocket ACKs every 35 seconds.
    try {
      const { NotificationDeliveryService } = await import('./services/notificationDeliveryService');
      const retryTimer = setInterval(async () => {
        try { await NotificationDeliveryService.processRetries(); } catch (e) {
          log.warn('NotificationDelivery retry job error', { error: e instanceof Error ? e.message : String(e) });
        }
      }, 60_000);
      const wsAckTimer = setInterval(async () => {
        try { await NotificationDeliveryService.processWebSocketAcks(); } catch (e) {
          log.warn('NotificationDelivery WS-ack job error', { error: e instanceof Error ? e.message : String(e) });
        }
      }, 35_000);
      registerDaemon('NotificationDeliveryRetry', () => { clearInterval(retryTimer); clearInterval(wsAckTimer); });
      log.info('NotificationDelivery daemon started — retry every 60s, WS-ack every 35s');
    } catch (error) {
      log.error('Failed to start NotificationDelivery daemon', { error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) });
    }

    const totalTime = Date.now() - startupStart;
    log.info('Full startup complete', { totalTimeMs: totalTime, listenTimeMs: listenTime, userAccessPercent: Math.round(listenTime/totalTime*100) });

    // Log Trinity domain health summary + action count after all registrations complete
    setTimeout(async () => {
      try {
        const { logDomainHealthSummary } = await import('./services/trinity/domainHealthValidator');
        logDomainHealthSummary();
      } catch (err) {
        log.warn('[Startup] Failed to log Trinity domain health summary', err);
      }
      try {
        const { platformActionHub } = await import('./services/helpai/platformActionHub');
        const actions = platformActionHub.getRegisteredActions();
        const catalog = platformActionHub.getTrinityActionCatalog('root_admin');
        const report = platformActionHub.getRegistryConsolidationReport();
        const byCategory = actions.reduce<Record<string, number>>((acc, a) => {
          acc[a.category] = (acc[a.category] || 0) + 1;
          return acc;
        }, {});
        log.info('[Audit] Trinity Action Surface', {
          executableHandlers: actions.length,
          trinityCatalogActions: catalog.length,
          maxCatalogActions: report.maxCatalogActions,
          duplicateActionIds: report.duplicateActionIds,
          legacyAliasActions: report.legacyAliasActions,
          internalActions: report.internalActions,
          byCategory,
          byOwnerDomain: report.byOwnerDomain,
        });
      } catch (err) {
        log.warn('[Startup] Failed to log Trinity action surface', err);
      }
    }, 5000);
  })();
})();
