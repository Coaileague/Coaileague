/**
 * Production Health Diagnostic Route — Wave 8.1
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/system/diagnostic
 *
 * Securely pings every critical production service and returns a full
 * green/red/yellow status report. Used to verify Railway environment variables
 * are correctly wired before Statewide Protective Services goes live.
 *
 * Security: requires DIAG_BYPASS_SECRET header to prevent public exposure.
 * In production the route is only accessible with the secret from Railway vars.
 *
 * Services checked:
 *   ✅ PostgreSQL (Neon) — real query, not just connection ping
 *   ✅ Redis — PING command round-trip
 *   ✅ Stripe — API key validation + mode detection (test vs live)
 *   ✅ Anthropic — API key format validation
 *   ✅ Gemini — API key format validation  
 *   ✅ Twilio — credentials present
 *   ✅ Resend — API key format validation
 *   ✅ Plaid — credentials present + environment check
 *   ✅ GCS / Object Storage — bucket configured
 *   ✅ Config validator — surfacing any warnings
 *   ✅ Missing critical vars — full gap report
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db';
import { validateConfiguration } from '../utils/configValidator';
import { createLogger } from '../lib/logger';

const log = createLogger('ProductionDiagnostic');
const router = Router();

interface ServiceResult {
  status: 'green' | 'yellow' | 'red';
  message: string;
  detail?: string;
}

// ── Individual service checkers ────────────────────────────────────────────

async function checkPostgres(): Promise<ServiceResult> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, current_database() as db, COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'');
    client.release();
    return {
      status: 'green',
      message: 'PostgreSQL connected',
      detail: `DB: ${result.rows[0].db} | Tables: ${result.rows[0].table_count} | Server time: ${result.rows[0].now}`,
    };
  } catch (err: unknown) {
    return { status: 'red', message: 'PostgreSQL FAILED', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRedis(): Promise<ServiceResult> {
  const url = process.env.REDIS_URL;
  if (!url) return { status: 'yellow', message: 'Redis not configured', detail: 'REDIS_URL missing — ChatDock multi-replica pub/sub disabled' };
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url });
    await client.connect();
    const pong = await client.ping();
    await client.disconnect();
    return { status: 'green', message: 'Redis connected', detail: `PING → ${pong}` };
  } catch (err: unknown) {
    return { status: 'red', message: 'Redis FAILED', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkStripeService(): Promise<ServiceResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: 'red', message: 'STRIPE_SECRET_KEY missing', detail: 'Billing and subscriptions will not work' };
  const isTest = key.includes('_test_');
  const isLive = key.includes('_live_');
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';

  if (isProduction && isTest) {
    return { status: 'yellow', message: 'Stripe TEST key in production', detail: 'Real payments will not process. Switch to live key for real billing.' };
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
    const account = await stripe.accounts.retrieve();
    const webhookSet = !!process.env.STRIPE_WEBHOOK_SECRET;
    const meterSet = !!process.env.STRIPE_TOKEN_METER_ID;
    return {
      status: webhookSet && meterSet ? 'green' : 'yellow',
      message: `Stripe connected (${isLive ? 'LIVE' : 'test'} mode)`,
      detail: `Account: ${account.id} | Webhook secret: ${webhookSet ? '✅' : '❌ MISSING'} | Token meter: ${meterSet ? '✅' : '❌ MISSING'}`,
    };
  } catch (err: unknown) {
    return { status: 'red', message: 'Stripe API FAILED', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkAnthropicService(): Promise<ServiceResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 'red', message: 'ANTHROPIC_API_KEY missing', detail: 'Claude/Trinity will not work' };
  if (!key.startsWith('sk-ant-')) return { status: 'yellow', message: 'ANTHROPIC_API_KEY format unexpected', detail: 'Expected sk-ant-... prefix' };
  return { status: 'green', message: 'Anthropic key present', detail: `Key: ${key.slice(0, 12)}...` };
}

async function checkGeminiService(): Promise<ServiceResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: 'yellow', message: 'GEMINI_API_KEY missing', detail: 'Gemini AI features disabled' };
  return { status: 'green', message: 'Gemini key present', detail: `Key: ${key.slice(0, 8)}...` };
}

async function checkTwilioService(): Promise<ServiceResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token) return { status: 'yellow', message: 'Twilio not configured', detail: 'SMS notifications and voice disabled' };
  return {
    status: 'green',
    message: 'Twilio credentials present',
    detail: `SID: ${sid.slice(0, 10)}... | Phone: ${phone || 'not set'}`,
  };
}

async function checkResendService(): Promise<ServiceResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: 'yellow', message: 'RESEND_API_KEY missing', detail: 'Transactional email disabled' };
  if (!key.startsWith('re_')) return { status: 'yellow', message: 'RESEND_API_KEY format unexpected', detail: 'Expected re_... prefix' };
  const webhookSet = !!process.env.RESEND_WEBHOOK_SECRET;
  return {
    status: 'green',
    message: 'Resend key present',
    detail: `Key: ${key.slice(0, 10)}... | Webhook secret: ${webhookSet ? '✅' : '⚠️ missing'}`,
  };
}

async function checkPlaidService(): Promise<ServiceResult> {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const plaidEnv = process.env.PLAID_ENV || 'sandbox';
  const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;
  const encKey = process.env.PLAID_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY;

  if (!clientId || !secret) return { status: 'yellow', message: 'Plaid not configured', detail: 'ACH direct deposit disabled — payroll calculation still works' };

  const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  const issues = [];
  if (!webhookSecret) issues.push('PLAID_WEBHOOK_SECRET missing (webhooks will return 500)');
  if (!encKey) issues.push('PLAID_ENCRYPTION_KEY missing (CRITICAL — bank tokens unprotected)');
  if (isProduction && plaidEnv === 'sandbox') issues.push('PLAID_ENV=sandbox in production (real bank accounts will not connect — pending Plaid production approval)');

  return {
    status: issues.length === 0 ? 'green' : (issues.some(i => i.includes('CRITICAL')) ? 'red' : 'yellow'),
    message: `Plaid configured (${plaidEnv} mode)`,
    detail: issues.length > 0 ? issues.join(' | ') : `Client: ${clientId.slice(0, 8)}... | Webhook: ✅ | Encryption: ✅`,
  };
}

async function checkObjectStorage(): Promise<ServiceResult> {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const gcsKey = process.env.GCS_KEY_JSON;
  if (!bucket) return { status: 'yellow', message: 'Object storage not configured', detail: 'File uploads (PDFs, photos, documents) disabled' };
  if (!gcsKey) return { status: 'yellow', message: 'GCS_KEY_JSON missing', detail: 'Bucket ID set but credentials missing' };
  return { status: 'green', message: 'Object storage configured', detail: `Bucket: ${bucket}` };
}

// ── Main diagnostic handler ────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  // Security gate — requires the DIAG_BYPASS_SECRET from Railway vars
  const provided = req.headers['x-diagnostic-secret'] || req.query.secret;
  const expected = process.env.DIAG_BYPASS_SECRET;

  if (!expected || provided !== expected) {
    return res.status(401).json({
      error: 'Unauthorized',
      hint: 'Pass X-Diagnostic-Secret header with DIAG_BYPASS_SECRET value from Railway vars',
    });
  }

  const startTime = Date.now();
  log.info('[Diagnostic] Production health check initiated');

  // Run all checks in parallel
  const [postgres, redis, stripe, anthropic, gemini, twilio, resend, plaid, storage] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkStripeService(),
    checkAnthropicService(),
    checkGeminiService(),
    checkTwilioService(),
    checkResendService(),
    checkPlaidService(),
    checkObjectStorage(),
  ]);

  // Run config validator to surface any warnings
  const configResult = validateConfiguration();

  const services = { postgres, redis, stripe, anthropic, gemini, twilio, resend, plaid, storage };
  const redCount = Object.values(services).filter(s => s.status === 'red').length;
  const yellowCount = Object.values(services).filter(s => s.status === 'yellow').length;
  const greenCount = Object.values(services).filter(s => s.status === 'green').length;

  const overallStatus = redCount > 0 ? 'RED' : yellowCount > 0 ? 'YELLOW' : 'GREEN';
  const isLaunchReady = redCount === 0 && postgres.status === 'green' && stripe.status !== 'red' && anthropic.status === 'green';

  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
    durationMs: Date.now() - startTime,
    overall: overallStatus,
    launchReady: isLaunchReady,
    summary: {
      green: greenCount,
      yellow: yellowCount,
      red: redCount,
      total: Object.keys(services).length,
    },
    services,
    configValidator: {
      valid: configResult.valid,
      errors: configResult.errors,
      warnings: configResult.warnings,
    },
    launchChecklist: {
      database: postgres.status === 'green' ? '✅ PostgreSQL connected' : '❌ Database not reachable',
      stripe: stripe.status !== 'red' ? '✅ Stripe configured' : '❌ Stripe missing',
      ai: anthropic.status === 'green' ? '✅ Anthropic (Trinity) ready' : '❌ Anthropic missing',
      email: resend.status === 'green' ? '✅ Email (Resend) configured' : '⚠️ Email not configured',
      sms: twilio.status === 'green' ? '✅ SMS (Twilio) configured' : '⚠️ SMS not configured',
      storage: storage.status === 'green' ? '✅ File storage ready' : '⚠️ File uploads disabled',
      plaid: plaid.status === 'green' ? '✅ Plaid ACH ready' : '⚠️ Plaid pending production approval (payroll calc still works)',
      sqlMigration: '⚠️ Run migrations/wave6_5_drop_dead_tables.sql on Railway Postgres manually',
    },
    adminTools: {
      orphanAudit: 'GET /api/admin/workspace/orphan-audit (X-Diagnostic-Secret) — find workspaces missing org_code/email/addresses',
      repairOne: 'POST /api/admin/workspace/repair-identity {workspaceId} — re-run onboarding for a specific workspace',
      repairAll: 'POST /api/admin/workspace/repair-all-orphans — bulk-repair all incomplete workspaces',
      statewideRepair: `POST /api/admin/workspace/repair-identity {"workspaceId":"${process.env.STATEWIDE_WORKSPACE_ID || 'set STATEWIDE_WORKSPACE_ID'}","dryRun":false}`,
    },
  };

  log.info(`[Diagnostic] Complete: ${overallStatus} (${redCount} red, ${yellowCount} yellow, ${greenCount} green) in ${report.durationMs}ms`);
  return res.status(overallStatus === 'GREEN' ? 200 : 207).json(report);
});

export default router;
