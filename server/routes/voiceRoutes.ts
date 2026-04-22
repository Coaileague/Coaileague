/**
 * TRINITY VOICE PHONE ROUTES — Phase 56 / 57
 * ============================================
 * All Twilio webhook endpoints + management API for the voice phone system.
 * Uses flat-rate billing model — call usage is logged for overage calculation,
 * no credit balance is maintained.
 *
 * Webhook routes (no auth — validated by Twilio HMAC):
 *   POST /api/voice/inbound
 *   POST /api/voice/language-select
 *   POST /api/voice/main-menu-route
 *   POST /api/voice/staff-menu
 *   POST /api/voice/clock-in-pin
 *   POST /api/voice/clock-in-verify
 *   POST /api/voice/recording-done
 *   POST /api/voice/status-callback
 *
 * Management API (requireAuth + requirePlan('professional')):
 *   GET  /api/voice/numbers
 *   GET  /api/voice/calls
 *   GET  /api/voice/calls/:id/transcript
 *   GET  /api/voice/analytics
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { PLATFORM } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('VoiceRoutes');

import { db } from '../db';
import {
  voiceCallSessions,
  workspacePhoneNumbers,
} from '../../shared/schema/domains/voice';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { requireAuth, type AuthenticatedRequest } from '../rbac';
import { requirePlan } from '../tierGuards';
import {
  handleInbound,
  buildMainIVR,
  buildGeneralMenu,
  buildLanguageSelect,
  resolveWorkspaceFromPhoneNumber,
  createCallSession,
  updateCallSession,
  logCallAction,
  recordCallUsage,
  twiml,
  say,
  redirect,
} from '../services/trinityVoice/voiceOrchestrator';

// Voice constants used inline by the new identify routes
const VOICE = 'Polly.Joanna-Neural';
const VOICE_ES = 'Polly.Lupe-Neural';
import { voiceSmsMeteringService } from '../services/billing/voiceSmsMeteringService';
import {
  isSubscriptionActive,
  isSubscriptionSuspended,
} from '../services/billing/billingConstants';
import { universalAudit } from '../services/universalAuditService';
import { handleSales } from '../services/trinityVoice/extensions/salesExtension';
import { handleClientSupport } from '../services/trinityVoice/extensions/clientExtension';
import { handleEmploymentVerification } from '../services/trinityVoice/extensions/verifyExtension';
import {
  handleStaff,
  handleClockInStep1,
  handleCollectPin,
  processClockIn,
  handleClockOutStep1,
  handleCollectClockOutPin,
  processClockOut,
  handleCallOff,
  handleStaffSupport,
} from '../services/trinityVoice/extensions/staffExtension';
import { handleEmergency } from '../services/trinityVoice/extensions/emergencyExtension';
import { handleCareers } from '../services/trinityVoice/extensions/careersExtension';
import {
  resolveWithTrinityBrain,
  getEscalationPhraseEn,
  getEscalationPhraseEs,
  getResolutionConfirmPhraseEn,
  getResolutionConfirmPhraseEs,
  getNameGatherPhraseEn,
  getNameGatherPhraseEs,
  getMessageGatherPhraseEn,
  getMessageGatherPhraseEs,
  getCaseCreatedPhraseEn,
  getCaseCreatedPhraseEs,
} from '../services/trinityVoice/trinityAIResolver';
import {
  createSupportCase,
  findCaseByNumber,
  listAllCases,
  listOpenCases,
  resolveSupportCase,
  notifyHumanAgents,
  getActiveAgents,
  getAllAgents,
  upsertAgent,
  deactivateAgent,
} from '../services/trinityVoice/supportCaseService';

export const voiceRouter = Router();

// Applied to every voice route so getLang() can fall back to session.language
// when Twilio re-requests without the ?lang= query param (timeouts, callbacks).
// Declared after voiceSessionLangMiddleware + getSession are defined below —
// attached via voiceRouter.use() near the bottom of module init.

// ─── Table Migration ──────────────────────────────────────────────────────────
// Creates voice tables if they don't exist yet (safe to run multiple times)

export async function initializeVoiceTables(): Promise<void> {
  try {
    const { pool } = await import('../db');
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS workspace_phone_numbers (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id VARCHAR NOT NULL,
          phone_number VARCHAR NOT NULL UNIQUE,
          friendly_name VARCHAR,
          twilio_sid VARCHAR NOT NULL,
          country VARCHAR NOT NULL DEFAULT 'US',
          capabilities JSONB DEFAULT '{"voice": true}',
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_primary BOOLEAN NOT NULL DEFAULT false,
          greeting_script TEXT,
          greeting_script_es TEXT,
          extension_config JSONB DEFAULT '{}',
          monthly_rent_cents INTEGER DEFAULT 100,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS voice_call_sessions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id VARCHAR NOT NULL,
          twilio_call_sid VARCHAR NOT NULL UNIQUE,
          caller_number VARCHAR,
          caller_name VARCHAR,
          phone_number_id VARCHAR,
          status VARCHAR NOT NULL DEFAULT 'initiated',
          direction VARCHAR NOT NULL DEFAULT 'inbound',
          language VARCHAR NOT NULL DEFAULT 'en',
          extension_reached VARCHAR,
          extension_label VARCHAR,
          started_at TIMESTAMP DEFAULT NOW(),
          ended_at TIMESTAMP,
          duration_seconds INTEGER,
          billed_minutes INTEGER,
          estimated_cost_cents INTEGER,
          actual_cost_cents INTEGER,
          credit_deducted BOOLEAN DEFAULT false,
          transcript TEXT,
          recording_url TEXT,
          recording_sid VARCHAR,
          clock_in_success BOOLEAN,
          clock_in_employee_id VARCHAR,
          clock_in_reference_id VARCHAR,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS voice_call_sessions_workspace_idx ON voice_call_sessions(workspace_id);
        CREATE INDEX IF NOT EXISTS voice_call_sessions_status_idx ON voice_call_sessions(status);
        CREATE INDEX IF NOT EXISTS voice_call_sessions_started_at_idx ON voice_call_sessions(started_at);
        CREATE TABLE IF NOT EXISTS voice_call_actions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          call_session_id VARCHAR NOT NULL,
          workspace_id VARCHAR NOT NULL,
          action VARCHAR NOT NULL,
          payload JSONB,
          outcome VARCHAR,
          error_message TEXT,
          occurred_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS voice_call_actions_session_idx ON voice_call_actions(call_session_id);
        CREATE INDEX IF NOT EXISTS voice_call_actions_workspace_idx ON voice_call_actions(workspace_id);
        CREATE TABLE IF NOT EXISTS voice_verification_log (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id VARCHAR NOT NULL,
          call_session_id VARCHAR,
          employee_id VARCHAR,
          employee_number VARCHAR,
          verification_type VARCHAR NOT NULL,
          outcome VARCHAR NOT NULL,
          failed_attempts INTEGER DEFAULT 0,
          ip_address VARCHAR,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS voice_verification_log_workspace_idx ON voice_verification_log(workspace_id);
        CREATE INDEX IF NOT EXISTS voice_verification_log_employee_idx ON voice_verification_log(employee_id);
        CREATE INDEX IF NOT EXISTS voice_verification_log_session_idx ON voice_verification_log(call_session_id);

        -- Phase 21 — voice 2FA code storage. DB-backed so codes survive across
        -- instances in a load-balanced deploy. TTL is enforced by expires_at.
        CREATE TABLE IF NOT EXISTS voice_verification_codes (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          employee_id VARCHAR NOT NULL,
          workspace_id VARCHAR NOT NULL,
          code_hash VARCHAR NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMP NOT NULL,
          consumed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS voice_verification_codes_employee_idx
          ON voice_verification_codes(employee_id, expires_at);
        CREATE INDEX IF NOT EXISTS voice_verification_codes_workspace_idx
          ON voice_verification_codes(workspace_id);

        CREATE TABLE IF NOT EXISTS voice_support_cases (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          workspace_id VARCHAR NOT NULL,
          case_number VARCHAR NOT NULL UNIQUE,
          call_session_id VARCHAR,
          caller_number VARCHAR,
          caller_name VARCHAR,
          issue_summary TEXT NOT NULL,
          ai_resolution_attempted BOOLEAN NOT NULL DEFAULT false,
          ai_resolution_text TEXT,
          ai_model_used VARCHAR,
          status VARCHAR NOT NULL DEFAULT 'open',
          resolved_at TIMESTAMP,
          resolved_by VARCHAR,
          resolution_notes TEXT,
          agent_notified BOOLEAN NOT NULL DEFAULT false,
          notification_sent_at TIMESTAMP,
          language VARCHAR NOT NULL DEFAULT 'en',
          transcript TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS voice_support_cases_workspace_idx ON voice_support_cases(workspace_id);
        CREATE INDEX IF NOT EXISTS voice_support_cases_status_idx ON voice_support_cases(status);
        CREATE INDEX IF NOT EXISTS voice_support_cases_case_number_idx ON voice_support_cases(case_number);
        CREATE INDEX IF NOT EXISTS voice_support_cases_created_idx ON voice_support_cases(created_at);

        CREATE TABLE IF NOT EXISTS voice_support_agents (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
          workspace_id VARCHAR NOT NULL,
          name VARCHAR NOT NULL,
          email VARCHAR,
          phone VARCHAR,
          role VARCHAR NOT NULL DEFAULT 'support_agent',
          notification_channels JSONB NOT NULL DEFAULT '["email"]',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(workspace_id, email)
        );
        CREATE INDEX IF NOT EXISTS voice_support_agents_workspace_idx ON voice_support_agents(workspace_id);
      `);
      // Add missing columns to existing tables (idempotent)
      await client.query(`
        ALTER TABLE workspace_phone_numbers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS direction VARCHAR NOT NULL DEFAULT 'inbound';
        ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER;
        ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS credit_deducted BOOLEAN DEFAULT false;
        ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS recording_sid VARCHAR;
        ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE voice_call_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      `).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // Seed the platform-wide CoAIleague number — idempotent, never duplicates
      // Uses PLATFORM_WORKSPACE_ID (env: PLATFORM_WORKSPACE_ID, default: 'coaileague-platform-workspace')
      // Override via PLATFORM_DEFAULT_WORKSPACE_ID for Railway deployments with a UUID-based workspace.
      const platformWorkspaceId =
        process.env.PLATFORM_DEFAULT_WORKSPACE_ID ||
        PLATFORM_WORKSPACE_ID;
      if (platformWorkspaceId) {
        // Ensure the platform workspace row exists before seeding the phone number,
        // otherwise any FK constraint silently aborts the insert.
        try {
          const wsColumns = await client.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'workspaces' ORDER BY ordinal_position LIMIT 50
          `);
          const colNames = wsColumns.rows.map((r: any) => r.column_name);

          if (colNames.includes('id') && colNames.includes('name')) {
            await client.query(`
              INSERT INTO workspaces (id, name, created_at, updated_at)
              VALUES ($1, 'CoAIleague', NOW(), NOW())
              ON CONFLICT (id) DO NOTHING
            `, [platformWorkspaceId]);
            log.info(`[VoiceRoutes] Platform workspace ${platformWorkspaceId} ensured`);
          }
        } catch (wsErr: any) {
          log.warn(`[VoiceRoutes] Platform workspace ensure failed (non-fatal): ${wsErr?.message}`);
        }

        await client.query(`
          INSERT INTO workspace_phone_numbers (
            id,
            workspace_id,
            phone_number,
            friendly_name,
            twilio_sid,
            country,
            capabilities,
            is_active,
            is_primary,
            extension_config
          )
          VALUES (
            gen_random_uuid()::text,
            $1,
            '+18664644151',
            'CoAIleague Main Line',
            'platform-main-line',
            'US',
            '{"voice": true}',
            true,
            true,
            '{"sales": true, "client_support": true, "employment_verification": true, "staff": true, "emergency": true, "careers": true}'
          )
          ON CONFLICT (phone_number) DO UPDATE SET
            extension_config = EXCLUDED.extension_config,
            workspace_id = EXCLUDED.workspace_id,
            is_active = true;
        `, [platformWorkspaceId]);
        log.info(`[VoiceRoutes] Platform number +18664644151 seeded (or already present) under workspace: ${platformWorkspaceId}`);
      }

      log.info('[VoiceRoutes] Voice tables initialized');
    } finally {
      client.release();
    }
  } catch (err: any) {
    log.warn('[VoiceRoutes] Voice table init failed (non-fatal):', err.message);
  }
}

// ─── Twilio Signature Validation (using official Twilio SDK) ─────────────────

async function validateTwilioSignature(req: Request): Promise<boolean> {
  // Read lazily — avoids module-load timing issues when env is populated after import
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';

  if (!authToken) {
    if (process.env.NODE_ENV === 'production') {
      log.error('[VoiceRoutes] TWILIO_AUTH_TOKEN not set in production — rejecting request');
      return false;
    }
    log.warn('[VoiceRoutes] TWILIO_AUTH_TOKEN not set — skipping signature validation in dev');
    return true;
  }

  const twilioSig = req.headers['x-twilio-signature'] as string;
  if (!twilioSig) {
    log.warn('[VoiceRoutes] Missing x-twilio-signature header');
    return false;
  }

  const params = req.body || {};
  // Reconstruct the URL from the actual incoming request headers so it always
  // matches what Twilio signed — regardless of BASE_URL env var or www. prefix.
  const proto = ((req.headers['x-forwarded-proto'] as string | undefined) || req.protocol)
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.get('host') || '';
  const url = `${proto}://${host}${req.originalUrl}`;

  try {
    // Use Twilio's official validateRequest to match their exact HMAC algorithm
    // including URL normalization and parameter serialization edge-cases.
    const { default: twilio } = await import('twilio');

    // Try primary URL
    const valid = twilio.validateRequest(authToken, twilioSig, url, params);
    if (valid) return true;
    log.warn(`[VoiceRoutes] Sig mismatch on: ${url}`);

    // Try alternate (www ↔ non-www fallback) — Twilio may have computed sig
    // against a different host than what reaches Express through the proxy chain.
    const altUrl = url.includes('www.')
      ? url.replace('https://www.', 'https://')
      : url.replace('https://', 'https://www.');
    const validAlt = twilio.validateRequest(authToken, twilioSig, altUrl, params);
    if (validAlt) {
      log.info(`[VoiceRoutes] Sig valid on alt URL: ${altUrl}`);
      return true;
    }

    log.warn(`[VoiceRoutes] Sig invalid on both ${url} and ${altUrl}`);
    return false;
  } catch (err: any) {
    log.warn('[VoiceRoutes] Twilio validateRequest error:', err.message);
    return false;
  }
}

function twilioSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
  validateTwilioSignature(req).then(valid => {
    if (!valid) {
      log.warn(`[VoiceRoutes] Invalid Twilio signature for ${req.path}`);
      res.status(403).send('Forbidden');
      return;
    }
    next();
  }).catch((err: any) => {
    log.error('[VoiceRoutes] Signature validation error:', err.message);
    res.status(500).send('Internal Server Error');
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  // Prefer x-forwarded-proto directly so https is preserved behind Railway/Render/Replit
  // proxies even when Express trust-proxy doesn't propagate it to req.protocol.
  const proto = ((req.headers['x-forwarded-proto'] as string | undefined) || req.protocol)
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.get('host') || 'www.coaileague.com';
  return `${proto}://${host}`;
}

function xmlResponse(res: Response, xml: string): void {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.send(xml);
}

function getLang(req: Request): 'en' | 'es' {
  // Priority: explicit query/body lang → middleware-hydrated session lang → 'en'
  // The session lang is loaded once per request by voiceSessionLangMiddleware
  // (registered on voiceRouter), eliminating the "caller picks Spanish, then
  // Twilio timeout loses ?lang= and flow drops back to English" defect.
  const explicit = req.query.lang || req.body.lang;
  if (explicit === 'es') return 'es';
  if (explicit === 'en') return 'en';
  const sessionLang = (req as any)._voiceSessionLang as string | undefined;
  if (sessionLang === 'es') return 'es';
  return 'en';
}

// Hydrates req._voiceSessionLang from voice_call_sessions.language when the
// caller has a known CallSid. Runs after twilioSignatureMiddleware so we
// don't incur a DB lookup on spoofed webhooks.
async function voiceSessionLangMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sid = (req.body?.CallSid as string | undefined) || '';
    if (!sid) return next();
    const session = await getSession(sid);
    if (session?.language === 'es' || session?.language === 'en') {
      (req as any)._voiceSessionLang = session.language;
    }
  } catch { /* fail-open */ }
  next();
}

async function getSession(callSid: string): Promise<typeof voiceCallSessions.$inferSelect | null> {
  const [session] = await db.select()
    .from(voiceCallSessions)
    .where(eq(voiceCallSessions.twilioCallSid, callSid))
    .limit(1);
  return session || null;
}

// Attach session-language hydration to every voice route so getLang() can
// honour the caller's previously-selected language even when the ?lang=
// query param is dropped on Twilio re-requests (timeouts, redirects).
voiceRouter.use(voiceSessionLangMiddleware);

// ─── 1. INBOUND WEBHOOK ───────────────────────────────────────────────────────

voiceRouter.post('/inbound', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { To, From, CallSid } = req.body;
    const baseUrl = getBaseUrl(req);

    log.info(`[VoiceRoutes] Inbound call: ${From} → ${To} (${CallSid})`);

    // Phase 18D — deferred caller-ID risk lookup. Result is cached and
    // available to downstream verifiers and the dashboard via session
    // metadata. Phase 26D — migrated from raw `void (async () => ...)()` to
    // scheduleNonBlocking for consistent labelled error logging (§B).
    scheduleNonBlocking('voice.caller-id-risk-lookup', async () => {
      const { lookupCallerId } = await import('../services/trinityVoice/callerIdLookup');
      const r = await lookupCallerId(From || '');
      if (r.risk === 'high') {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                             jsonb_build_object('caller_id_risk', $1::text,
                                                'line_type', $2::text,
                                                'carrier', $3::text)
            WHERE twilio_call_sid = $4`,
          [r.risk, r.lineType || null, r.carrierName || null, CallSid]
        );
      }
    });

    const xml = await handleInbound({ to: To, from: From, callSid: CallSid, baseUrl });
    xmlResponse(res, xml);
  } catch (err: any) {
    log.error('[VoiceRoutes] Inbound error:', err.message);
    xmlResponse(res, twiml('<Say>We are experiencing technical difficulties. Please try again. Goodbye.</Say>'));
  }
});

// ─── 2. LANGUAGE SELECT ───────────────────────────────────────────────────────

voiceRouter.post('/language-select', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits, To } = req.body;
    const baseUrl = getBaseUrl(req);

    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) {
      return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));
    }

    const session = await getSession(CallSid);

    let lang: 'en' | 'es' = 'en';
    if (Digits === '2') {
      lang = 'es';
    } else if (Digits === '1') {
      lang = 'en';
    }

    if (session) {
      await updateCallSession(CallSid, { language: lang });
    }

    const extEnabled = (workspace.phoneRecord.extensionConfig as Record<string, boolean>) || {};
    const xml = buildMainIVR(lang, baseUrl, extEnabled);
    xmlResponse(res, xml);
  } catch (err: any) {
    log.error('[VoiceRoutes] Language-select error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 2b. CALLER IDENTIFY (Phase 18B) ──────────────────────────────────────────
// After Trinity introduces herself, the caller picks who they are:
//   1 = employee/platform user → speech ID → personalized lane
//   2 = client of a security provider → identify provider by name/license
//   3 (or anything else) = general menu

voiceRouter.post('/caller-identify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, To, From, SpeechResult } = req.body;
    let Digits: string = (req.body.Digits as string) || '';
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));

    const { workspaceId } = workspace;
    const session = await getSession(CallSid);
    const sessionId = session?.id || CallSid;
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    // Phase 21 — speech-first routing. If the caller spoke instead of pressing
    // a digit, classify the intent and map it onto the equivalent menu choice.
    const spoken = (SpeechResult || '').toLowerCase().trim();
    if (!Digits && spoken) {
      const { detectVoiceIntent } = await import('../services/trinityVoice/voiceIntentDetector');
      const intent = detectVoiceIntent(spoken, lang);
      log.info(`[VoiceRoutes] caller-identify speech intent: "${spoken}" → ${intent}`);
      if (intent === 'emergency') {
        // Route straight to emergency — do NOT detour through the general menu.
        return xmlResponse(res, twiml(redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=5`)));
      }
      if (intent === 'employee') Digits = '1';
      else if (intent === 'client') Digits = '2';
      else if (intent === 'sales') {
        return xmlResponse(res, twiml(redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=1`)));
      }
      else if (intent === 'careers') {
        return xmlResponse(res, twiml(redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=6`)));
      }
      else if (intent === 'verify') {
        return xmlResponse(res, twiml(redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=3`)));
      }
      else if (intent === 'support') {
        // "I need help" — drop them into free conversational mode with Trinity.
        return xmlResponse(res, twiml(redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=0`)));
      }
      else Digits = '3';
    }

    if (Digits === '1') {
      // Phase 18C anti-fraud — the personalized lane is gated on phone-on-profile.
      const { verifyCaller, verificationFailureMessageVoice } = await import('../services/trinityVoice/trinityCallerVerification');
      const v = await verifyCaller(From || '');
      if (!v.verified) {
        // Phase 21 — if the employee record exists but is not linked to a user
        // account, offer an email 2FA verification code instead of dropping
        // straight to the general menu.
        if (v.reason === 'no_user_link' && v.employeeId) {
          const { getMaskedEmailForEmployee } = await import('../services/trinityVoice/voiceVerificationCodeService');
          const maskedEmail = await getMaskedEmailForEmployee(v.employeeId);
          if (maskedEmail) {
            const codeAction = `${baseUrl}/api/voice/send-verification?employeeId=${encodeURIComponent(v.employeeId)}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
            const offer = lang === 'es'
              ? `Encontré su perfil pero su teléfono aún no está vinculado a su cuenta. Puedo enviar un código de verificación a ${maskedEmail}. Marque 1 para recibir el código, o marque 2 para continuar al menú general.`
              : `I found your profile but your phone isn't linked to your account yet. I can send a verification code to ${maskedEmail}. Press 1 to receive the code, or press 2 to continue to the general menu.`;
            return xmlResponse(res, twiml(
              `<Gather input="dtmf" numDigits="1" timeout="10" action="${codeAction}" method="POST">` +
              say(offer, voiceId, langCode) +
              `</Gather>` +
              redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
            ));
          }
        }

        log.info(`[VoiceRoutes] Caller verification failed for ${From} (${v.reason}) — routing to general menu`);
        return xmlResponse(res, twiml(
          say(verificationFailureMessageVoice(lang), voiceId, langCode) +
          redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
        ));
      }

      // Phase 24 — owner PIN gate. If the verified caller is the workspace
      // owner (and their owner PIN is set), offer an optional PIN step before
      // the staff menu. Authenticated owners get elevated authority for the
      // sensitive Trinity voice actions (approve payroll runs, trigger
      // workflows, override assignments) that downstream extensions check for.
      try {
        if (v.userId && v.workspaceId) {
          const { pool } = await import('../db');
          const ownerRow = await pool.query(
            `SELECT 1
               FROM workspaces
              WHERE id = $1
                AND owner_id = $2
                AND owner_pin_hash IS NOT NULL
              LIMIT 1`,
            [v.workspaceId, v.userId],
          );
          if (ownerRow.rowCount && ownerRow.rowCount > 0) {
            const pinAction = `${baseUrl}/api/voice/owner-pin-verify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(v.workspaceId)}&lang=${lang}`;
            const skipAction = `${baseUrl}/api/voice/staff-identify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(v.workspaceId)}&lang=${lang}`;
            const pinPrompt = lang === 'es'
              ? `Hola ${v.firstName}. Para acceso con autoridad completa, marque su código PIN de propietario seguido de la tecla numeral. O marque cero para continuar sin PIN.`
              : `Hi ${v.firstName}. For full-authority access, please enter your owner PIN followed by the pound key. Or press zero to continue without a PIN.`;
            return xmlResponse(res, twiml(
              `<Gather input="dtmf" action="${pinAction}" method="POST" timeout="10" finishOnKey="#" numDigits="9">` +
              say(pinPrompt, voiceId, langCode) +
              `</Gather>` +
              redirect(skipAction)
            ));
          }
        }
      } catch (pinErr: any) {
        log.warn('[VoiceRoutes] Owner-PIN gate check failed (non-fatal):', pinErr?.message);
      }

      const prompt = lang === 'es'
        ? `Hola ${v.firstName}, qué bueno escucharle. Por favor diga su número de empleado o el motivo de su llamada para ayudarle más rápido.`
        : `Hi ${v.firstName}, great to hear from you. Please say your employee number or the reason for your call so I can help you faster.`;

      const action = `${baseUrl}/api/voice/staff-identify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${action}" method="POST" timeout="10" speechTimeout="auto">` +
        say(prompt, voiceId, langCode) +
        `</Gather>` +
        say(lang === 'es' ? 'No escuché nada. Pasando al menú general.' : 'I did not hear anything. Taking you to the main menu.', voiceId, langCode) +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    if (Digits === '2') {
      const prompt = lang === 'es'
        ? 'Por favor diga el nombre de su empresa de seguridad o su número de licencia para que pueda conectarle con su proveedor.'
        : 'Please say the name of your security company or their license number so I can connect you with your provider.';

      const action = `${baseUrl}/api/voice/client-identify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${action}" method="POST" timeout="10" speechTimeout="auto">` +
        say(prompt, voiceId, langCode) +
        `</Gather>` +
        say(lang === 'es' ? 'No le escuché. Pasando al menú general.' : 'I did not catch that. Taking you to the general menu.', voiceId, langCode) +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    // Press 3, 0, or no input → general menu
    const extEnabled = (workspace.phoneRecord.extensionConfig as Record<string, boolean>) || {};
    return xmlResponse(res, buildGeneralMenu(lang, baseUrl, extEnabled));

  } catch (err: any) {
    log.error('[VoiceRoutes] caller-identify error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Please try again.</Say>'));
  }
});

// ─── 2c. STAFF IDENTIFY (Phase 18B) ───────────────────────────────────────────
// Caller says their name or employee number. Trinity tries a fuzzy lookup; either way
// it routes them into the staff menu (handler takes over from there).

voiceRouter.post('/staff-identify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, SpeechResult, Digits, To } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));

    const { workspaceId } = workspace;
    const session = await getSession(CallSid);
    const sessionId = session?.id || CallSid;
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    const spoken = (SpeechResult || Digits || '').trim();
    let foundFirst: string | null = null;
    if (spoken) {
      try {
        const { pool } = await import('../db');
        const cleaned = spoken.replace(/[^a-zA-Z0-9\s\-]/g, '').slice(0, 64);
        const result = await pool.query(
          `SELECT first_name FROM employees
           WHERE workspace_id = $1
             AND is_active = true
             AND (
               LOWER(first_name || ' ' || last_name) LIKE LOWER($2)
               OR LOWER(employee_number) = LOWER($3)
             )
           LIMIT 1`,
          [workspaceId, `%${cleaned}%`, cleaned]
        );
        if (result.rows.length) foundFirst = result.rows[0].first_name;
      } catch (e: any) {
        log.warn('[VoiceRoutes] staff-identify lookup failed (non-fatal):', e.message);
      }
    }

    const greet = foundFirst
      ? (lang === 'es'
          ? `Hola ${foundFirst}, encantada de hablar con usted. `
          : `Hi ${foundFirst}, great to hear from you. `)
      : (lang === 'es'
          ? 'Gracias. '
          : 'Thanks for that. ');

    return xmlResponse(res, twiml(
      say(greet + (lang === 'es'
        ? 'Pasando al menú de personal.'
        : 'Taking you to the staff menu now.'), voiceId, langCode) +
      redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=4`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] staff-identify error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 2c-bis. OWNER PIN VERIFY (Phase 24) ──────────────────────────────────────
// Optional PIN step after Digit-1 + phone-verified + owner-of-workspace.
// Verifies the PIN against workspaces.owner_pin_hash via entityPinService,
// stamps the call session's metadata with owner_pin_verified=true for
// downstream extensions that elevate authority, and redirects to the normal
// staff-identify flow. On failure / skip, still continues to staff identify
// so the caller is never blocked — voice is a fallback channel.

voiceRouter.post('/owner-pin-verify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, To } = req.body;
    const Digits: string = (req.body.Digits as string) || '';
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));

    const { workspaceId } = workspace;
    const session = await getSession(CallSid);
    const sessionId = session?.id || CallSid;
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    const staffIdentify = `${baseUrl}/api/voice/staff-identify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;

    // 0 = skip. Empty = timeout (treat as skip). Anything shorter than 4 digits
    // is not a valid PIN; skip straight to staff identify.
    const trimmed = (Digits || '').replace(/\D/g, '');
    if (!trimmed || trimmed === '0' || trimmed.length < 4) {
      return xmlResponse(res, twiml(
        say(lang === 'es'
          ? 'Continuando al menú de personal.'
          : 'Continuing to the staff menu.', voiceId, langCode) +
        redirect(staffIdentify)
      ));
    }

    // Verify PIN against the workspace owner record. Tenant-scoped by design —
    // entityPinService enforces workspace match inside the SQL WHERE clause.
    let verified = false;
    try {
      const { verifyEntityPin } = await import('../services/entityPinService');
      const result = await verifyEntityPin({
        entity: 'owner',
        entityId: workspaceId,
        workspaceId,
        pin: trimmed,
      });
      verified = result.valid;
      log.info(`[VoiceRoutes] owner-pin-verify: workspace=${workspaceId} valid=${verified} reason=${result.reason}`);
    } catch (pinErr: any) {
      log.warn('[VoiceRoutes] owner-pin-verify call failed (non-fatal):', pinErr?.message);
    }

    // Stamp the session so downstream extensions (staff menu, payroll approval,
    // etc.) can check whether this call is owner-PIN-elevated without re-doing
    // the bcrypt work. Fire-and-await but tolerate metadata write failures.
    if (verified) {
      try {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb)
                             || jsonb_build_object(
                                  'owner_pin_verified', true,
                                  'owner_pin_verified_at', NOW()::text
                                )
            WHERE twilio_call_sid = $1`,
          [CallSid],
        );
      } catch (metaErr: any) {
        log.warn('[VoiceRoutes] owner-pin session stamp failed (non-fatal):', metaErr?.message);
      }
    }

    const ack = verified
      ? (lang === 'es'
          ? 'PIN verificado. Tiene autoridad completa para esta llamada.'
          : 'PIN verified. You have full authority for this call.')
      : (lang === 'es'
          ? 'No pude verificar ese PIN. Continuaré sin autoridad elevada.'
          : 'I could not verify that PIN. Continuing without elevated authority.');

    // Phase 29 — on successful owner PIN, route into the owner authority
    // menu (payroll approvals, overrides, compliance alerts, KPIs). On
    // failure, fall back to the normal staff identify flow.
    const nextTarget = verified
      ? `${baseUrl}/api/voice/owner-menu?sessionId=${encodeURIComponent(CallSid)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`
      : staffIdentify;

    return xmlResponse(res, twiml(
      say(ack, voiceId, langCode) +
      redirect(nextTarget)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] owner-pin-verify error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 2d. CLIENT IDENTIFY (Phase 18B) ──────────────────────────────────────────
// Caller says the name of their security provider. Trinity acknowledges and
// routes them to client support (which handles the actual escalation).

voiceRouter.post('/client-identify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, SpeechResult, To } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));

    const session = await getSession(CallSid);
    const sessionId = session?.id || CallSid;
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    const spoken = (SpeechResult || '').trim().slice(0, 200);
    let resolvedProviderName: string | null = null;
    let resolvedProviderWorkspaceId: string | null = null;

    if (spoken) {
      // Phase 21 — actually look up the security provider's workspace by
      // company name or license number so downstream support routing knows
      // which tenant context to use.
      try {
        const { pool } = await import('../db');
        const cleanedSlug = spoken.replace(/[^a-zA-Z0-9]/g, '');
        const r = await pool.query(
          `SELECT id, name, company_name, state_license_number
             FROM workspaces
            WHERE LOWER(coalesce(name, '')) LIKE LOWER($1)
               OR LOWER(coalesce(company_name, '')) LIKE LOWER($1)
               OR LOWER(coalesce(state_license_number, '')) = LOWER($2)
            LIMIT 1`,
          [`%${spoken.slice(0, 50)}%`, cleanedSlug],
        );
        if (r.rows.length) {
          resolvedProviderWorkspaceId = r.rows[0].id;
          resolvedProviderName = r.rows[0].company_name || r.rows[0].name;
        }
      } catch (lookupErr: any) {
        log.warn('[VoiceRoutes] client-identify provider lookup failed:', lookupErr?.message);
      }

      if (session) {
        // Phase 26D — downstream handleClientSupport pulls this metadata to
        // enrich client context. Await the write so the next step sees it,
        // but catch + log non-fatally rather than swallowing silently.
        try {
          await updateCallSession(CallSid, {
            metadata: {
              client_provider_name: resolvedProviderName || spoken,
              client_provider_workspace_id: resolvedProviderWorkspaceId,
              client_provider_resolved: !!resolvedProviderWorkspaceId,
            },
          });
        } catch (metaErr: any) {
          log.warn('[VoiceRoutes] client-identify session metadata write failed (non-fatal):', metaErr?.message);
        }
      }

      logCallAction({
        callSessionId: sessionId,
        workspaceId: workspace.workspaceId,
        action: 'client_identify_provider',
        payload: {
          provider: spoken,
          resolved: !!resolvedProviderWorkspaceId,
          providerWorkspaceId: resolvedProviderWorkspaceId,
          lang,
        },
        outcome: 'success',
      }).catch((err: any) => log.warn('[VoiceRoutes] client-identify log failed:', err?.message));
    }

    const providerNameForAck = resolvedProviderName || (spoken ? spoken : null);
    const ack = providerNameForAck
      ? (lang === 'es'
          ? `Gracias. Conectándole con soporte de ${providerNameForAck}.`
          : `Thank you. Connecting you with support from ${providerNameForAck}.`)
      : (lang === 'es'
          ? 'Gracias. Conectándole con soporte al cliente.'
          : 'Thank you. Connecting you with client support.');

    return xmlResponse(res, twiml(
      say(ack, voiceId, langCode) +
      redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=2`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] client-identify error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 2e. GENERAL MENU (Phase 18B) ─────────────────────────────────────────────
// Direct entry into the numbered service menu.

voiceRouter.post('/general-menu', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { To } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));

    const extEnabled = (workspace.phoneRecord.extensionConfig as Record<string, boolean>) || {};
    return xmlResponse(res, buildGeneralMenu(lang, baseUrl, extEnabled));
  } catch (err: any) {
    log.error('[VoiceRoutes] general-menu error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 3. MAIN MENU ROUTE ───────────────────────────────────────────────────────

voiceRouter.post('/main-menu-route', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, To, SpeechResult } = req.body;
    // Allow upstream identify routes to bridge into the menu via a `_d` query param.
    let Digits: string = req.body.Digits || (req.query._d as string) || '';
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    // Phase 21 — if the caller spoke instead of pressing a digit, translate
    // the intent onto the equivalent menu option so the flow continues
    // naturally. Language-switch ("english" / "español") is handled here too.
    const spokenMenu = (SpeechResult || '').toLowerCase().trim();

    // Phase 28 — global speech shortcuts reachable from any menu level:
    //   "auditor" / "inspector" / "state inspector" → SRA identify flow
    //   "operator" / "human" / "agent" / "representative" → human callback
    if (!Digits && spokenMenu) {
      if (/\b(auditor|inspector|regulatory|badge|state.*inspector|p\s?s\s?b)\b/.test(spokenMenu) ||
          /\b(auditor|inspector|regulador|placa)\b/.test(spokenMenu)) {
        return xmlResponse(res, twiml(
          redirect(`${getBaseUrl(req)}/api/voice/sra-identify?sessionId=${encodeURIComponent(CallSid)}&lang=${lang}&step=prompt-badge`)
        ));
      }
      if (/\b(operator|human|real.*person|representative|agent)\b/.test(spokenMenu) ||
          /\b(operador|humano|persona real|representante|agente)\b/.test(spokenMenu)) {
        return xmlResponse(res, twiml(
          redirect(`${getBaseUrl(req)}/api/voice/schedule-callback?sessionId=${encodeURIComponent(CallSid)}&lang=${lang}`)
        ));
      }
    }

    if (!Digits && spokenMenu) {
      if (/\b(english|ingl[eé]s)\b/.test(spokenMenu) || /\b(espa[nñ]ol|spanish)\b/.test(spokenMenu)) {
        Digits = '9';
      } else {
        const { detectVoiceIntent } = await import('../services/trinityVoice/voiceIntentDetector');
        const intent = detectVoiceIntent(spokenMenu, lang);
        const intentToDigit: Record<string, string> = {
          sales: '1',
          client: '2',
          verify: '3',
          employee: '4',
          emergency: '5',
          careers: '6',
          support: '0',
        };
        Digits = intentToDigit[intent] || '';
      }
    }

    const workspace = await resolveWorkspaceFromPhoneNumber(To);
    if (!workspace) {
      return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));
    }

    const { workspaceId } = workspace;
    const extEnabled = (workspace.phoneRecord.extensionConfig as Record<string, boolean>) || {};
    const isExtEnabled = (key: string) => extEnabled[key] !== false;

    const DIGIT_TO_EXT: Record<string, string> = {
      '1': 'sales', '2': 'client_support', '3': 'employment_verification',
      '4': 'staff', '5': 'emergency', '6': 'careers',
    };

    const session = await getSession(CallSid);
    const sessionId = session?.id || CallSid;
    const extKey = DIGIT_TO_EXT[Digits];

    if (session) {
      await updateCallSession(CallSid, {
        extensionReached: Digits,
        extensionLabel: getExtensionLabel(Digits),
        language: lang,
      });
    }

    const baseParams = { callSid: CallSid, sessionId, workspaceId, lang, baseUrl };

    // Enforce extension config — redirect disabled extensions back to the menu
    if (extKey && !isExtEnabled(extKey)) {
      const disabledMsg = lang === 'es'
        ? 'Lo sentimos, esa extensión no está disponible en este momento. '
        : 'Sorry, that extension is not available at this time. ';
      return xmlResponse(res, twiml(
        say(disabledMsg, 'Polly.Penelope', lang === 'es' ? 'es-US' : 'en-US') +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    switch (Digits) {
      case '1':
        return xmlResponse(res, handleSales(baseParams));
      case '2': {
        // Phase 25 — surface client context (provider workspace + caller phone +
        // pre-resolved clientId) so clientExtension can enrich Trinity's prompt.
        const meta = (session?.metadata as Record<string, any> | null) || {};
        const providerWorkspaceId = meta.client_provider_workspace_id || undefined;
        const clientId = meta.client_id || undefined;
        const callerPhone = (req.body.From as string | undefined) || session?.callerNumber || undefined;
        const xml = await handleClientSupport({
          ...baseParams,
          clientId,
          callerPhone,
          providerWorkspaceId,
        });
        return xmlResponse(res, xml);
      }
      case '3':
        return xmlResponse(res, handleEmploymentVerification(baseParams));
      case '4':
        return xmlResponse(res, handleStaff(baseParams));
      case '5':
        return xmlResponse(res, handleEmergency(baseParams));
      case '6':
        return xmlResponse(res, handleCareers(baseParams));
      case '7': {
        // Case status check
        const caseCheckAction = `${baseUrl}/api/voice/case-check?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
        const caseCheckPrompt = lang === 'es'
          ? 'Por favor diga o ingrese su número de causa para verificar el estado de su caso.'
          : 'Please say or enter your cause number to check the status of your support case.';
        return xmlResponse(res, twiml(
          `<Gather input="speech dtmf" action="${caseCheckAction}" method="POST" timeout="10" speechTimeout="auto">` +
          say(caseCheckPrompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
          `</Gather>` +
          say(lang === 'es' ? 'No se recibió entrada. Adiós.' : 'No input received. Goodbye.')
        ));
      }
      case '8': {
        // Phase 18B — Schedule a human callback
        const cbAction = `${baseUrl}/api/voice/schedule-callback?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
        const cbPrompt = lang === 'es'
          ? 'Por favor deje su nombre, su número de teléfono y la mejor hora para llamarle. Programaré una llamada con un humano.'
          : 'Please leave your name, the best phone number to reach you, and the best time to call. I will schedule a callback with a human team member.';
        return xmlResponse(res, twiml(
          say(cbPrompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
          `<Record action="${cbAction}" maxLength="90" playBeep="true" />` +
          say(lang === 'es' ? 'Gracias. Hemos recibido su solicitud. Adiós.' : 'Thank you. Your callback request has been received. Goodbye.')
        ));
      }
      case '0': {
        // Phase 21 — digit 0 enters free conversational mode with Trinity.
        const talkAction = `${baseUrl}/api/voice/trinity-talk?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&turn=1`;
        const invite = lang === 'es'
          ? 'Claro. Dígame, ¿en qué puedo ayudarle hoy? Puede hablar libremente, le estoy escuchando.'
          : 'Of course. Go ahead — what can I help you with today? You can speak freely, I\'m listening.';
        return xmlResponse(res, twiml(
          `<Gather input="speech" action="${talkAction}" method="POST" timeout="15" speechTimeout="auto">` +
          say(invite, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
          `</Gather>` +
          redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
        ));
      }
      case '9': {
        // Toggle language and re-present the general menu
        const newLang = lang === 'en' ? 'es' : 'en';
        return xmlResponse(res, buildGeneralMenu(newLang, baseUrl, extEnabled));
      }
      default:
        return xmlResponse(res, buildGeneralMenu(lang, baseUrl, extEnabled));
    }
  } catch (err: any) {
    log.error('[VoiceRoutes] Main-menu-route error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

function getExtensionLabel(digit: string): string {
  const labels: Record<string, string> = {
    '1': 'sales', '2': 'client_support', '3': 'employment_verification',
    '4': 'staff', '5': 'emergency', '6': 'careers',
  };
  return labels[digit] || 'unknown';
}

// ─── 4. STAFF MENU ROUTE ──────────────────────────────────────────────────────

voiceRouter.post('/staff-menu', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const { sessionId, workspaceId } = extractQS(req);

    logCallAction({ callSessionId: sessionId, workspaceId, action: 'staff_menu_selection',
      payload: { digit: Digits }, outcome: 'success' }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    const baseParams = { callSid: CallSid, sessionId, workspaceId, lang, baseUrl };

    switch (Digits) {
      case '1':
        return xmlResponse(res, handleClockInStep1(baseParams));
      case '2':
        return xmlResponse(res, handleCallOff(baseParams));
      case '3':
        return xmlResponse(res, handleStaffSupport(baseParams));
      case '4':
        return xmlResponse(res, handleClockOutStep1(baseParams));
      default:
        return xmlResponse(res, handleStaff(baseParams));
    }
  } catch (err: any) {
    log.error('[VoiceRoutes] Staff-menu error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 4b. CLOCK-OUT PIN COLLECTION (Phase 18B+) ────────────────────────────────

voiceRouter.post('/clock-out-pin', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits, SpeechResult } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const { sessionId, workspaceId } = extractQS(req);

    let employeeNumber = Digits?.trim() || '';
    if (!employeeNumber && SpeechResult) {
      employeeNumber = SpeechResult
        .replace(/\b(dash|hyphen|minus)\b/gi, '-')
        .replace(/[^a-zA-Z0-9\-]/g, '')
        .toUpperCase();
    }

    if (!employeeNumber || employeeNumber.length < 3) {
      const msg = lang === 'es'
        ? twiml('<Say voice="Polly.Lupe-Neural" language="es-US">Número inválido. Adiós.</Say>')
        : twiml('<Say>Invalid employee number. Goodbye.</Say>');
      return xmlResponse(res, msg);
    }

    return xmlResponse(res, handleCollectClockOutPin({
      callSid: CallSid, sessionId, workspaceId, lang, baseUrl, employeeNumber,
    }));
  } catch (err: any) {
    log.error('[VoiceRoutes] Clock-out-pin error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 4c. CLOCK-OUT VERIFY (Phase 18B+) ────────────────────────────────────────

voiceRouter.post('/clock-out-verify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits } = req.body;
    const lang = getLang(req);
    const { sessionId, workspaceId } = extractQS(req);
    const employeeNumber = (req.query.employeeNumber as string) || '';

    if (!Digits || Digits.length !== 6) {
      const msg = lang === 'es'
        ? twiml('<Say voice="Polly.Lupe-Neural" language="es-US">PIN inválido. Adiós.</Say>')
        : twiml('<Say>Invalid PIN. Goodbye.</Say>');
      return xmlResponse(res, msg);
    }

    const xml = await processClockOut({
      callSid: CallSid, sessionId, workspaceId, lang, employeeNumber, pin: Digits,
    });
    xmlResponse(res, xml);
  } catch (err: any) {
    log.error('[VoiceRoutes] Clock-out-verify error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred processing your clock-out. Goodbye.</Say>'));
  }
});

// ─── 5. CLOCK-IN PIN COLLECTION (employee number received) ───────────────────

voiceRouter.post('/clock-in-pin', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits, SpeechResult } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const { sessionId, workspaceId } = extractQS(req);

    // Accept DTMF digits or speech result
    // Speech recognition returns natural language, e.g. "E M P dash zero zero one" or "1234"
    // We normalize speech by preserving alphanumeric characters and common separators.
    let employeeNumber = Digits?.trim() || '';
    if (!employeeNumber && SpeechResult) {
      // Normalize spoken employee number: keep alphanumeric and hyphens, collapse spaces
      employeeNumber = SpeechResult
        .replace(/\b(dash|hyphen|minus)\b/gi, '-')  // spoken "dash" → literal hyphen
        .replace(/[^a-zA-Z0-9\-]/g, '')             // strip everything else
        .toUpperCase();
    }

    if (!employeeNumber || employeeNumber.length < 3) {
      const msg = lang === 'es'
        ? twiml('<Say voice="Polly.Penelope" language="es-US">Número inválido. Por favor intente de nuevo. Adiós.</Say>')
        : twiml('<Say>Invalid employee number. Please try again. Goodbye.</Say>');
      return xmlResponse(res, msg);
    }

    return xmlResponse(res, handleCollectPin({
      callSid: CallSid, sessionId, workspaceId, lang, baseUrl, employeeNumber,
    }));
  } catch (err: any) {
    log.error('[VoiceRoutes] Clock-in-pin error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 6. CLOCK-IN VERIFY (PIN received, perform clock-in) ─────────────────────

voiceRouter.post('/clock-in-verify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits } = req.body;
    const lang = getLang(req);
    const { sessionId, workspaceId } = extractQS(req);
    const employeeNumber = (req.query.employeeNumber as string) || '';

    if (!Digits || Digits.length !== 6) {
      const msg = lang === 'es'
        ? twiml('<Say voice="Polly.Penelope" language="es-US">PIN inválido. Adiós.</Say>')
        : twiml('<Say>Invalid PIN. Goodbye.</Say>');
      return xmlResponse(res, msg);
    }

    const xml = await processClockIn({
      callSid: CallSid, sessionId, workspaceId, lang, employeeNumber, pin: Digits,
      baseUrl: getBaseUrl(req),
    });
    xmlResponse(res, xml);
  } catch (err: any) {
    log.error('[VoiceRoutes] Clock-in-verify error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred processing your clock-in. Goodbye.</Say>'));
  }
});

// ─── 7. RECORDING DONE ───────────────────────────────────────────────────────

voiceRouter.post('/recording-done', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, RecordingUrl, RecordingSid, RecordingDuration } = req.body;
    const ext = (req.query.ext as string) || 'unknown';

    if (RecordingUrl && RecordingSid) {
      await updateCallSession(CallSid, { recordingUrl: RecordingUrl, recordingSid: RecordingSid });

      // Trigger Twilio transcription asynchronously for completed recordings
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const transcriptionBaseUrl = getBaseUrl(req);
        scheduleNonBlocking('voice.transcription-request', async () => {
          const twilio = (await import('twilio')).default;
          const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          const baseUrl = transcriptionBaseUrl;
          // Use a typed create call; statusCallbackUrl is a valid Twilio param
          // transcriptions.create accepts optional params beyond the TS typings
          await ((twilioClient.recordings(RecordingSid) as any).transcriptions.create as (
            opts: { statusCallbackUrl?: string }
          ) => Promise<unknown>)({
            statusCallbackUrl: `${baseUrl}/api/voice/transcription-done`,
          });
          log.info(`[VoiceRoutes] Transcription requested for recording ${RecordingSid}`);
        });
      }
    }

    log.info(`[VoiceRoutes] Recording done for ext=${ext} callSid=${CallSid} duration=${RecordingDuration}s`);

    // Phase 20 — voice calloff (extension 4→2) triggers the autonomous
    // coverage workflow. We look up the caller's employee profile via the
    // call session and hand off to executeCalloffCoverageWorkflow. Scheduled
    // non-blocking (not fire-and-forget — scheduleNonBlocking is the
    // platform-approved wrapper, per TRINITY.md §F) so Twilio gets a fast
    // TwiML response while the fan-out runs in the background.
    if (ext === 'calloff') {
      scheduleNonBlocking('voice.calloff-workflow', async () => {
        try {
          const [session] = await db
            .select({
              workspaceId: voiceCallSessions.workspaceId,
              callerNumber: voiceCallSessions.callerNumber,
            })
            .from(voiceCallSessions)
            .where(eq(voiceCallSessions.twilioCallSid, CallSid))
            .limit(1);
          if (!session?.workspaceId || !session.callerNumber) return;
          const { pool } = await import('../db');
          const digits = session.callerNumber.replace(/\D/g, '').replace(/^1/, '');
          const emp = await pool.query(
            `SELECT id FROM employees
              WHERE workspace_id = $1
                AND is_active = true
                AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE $2
              LIMIT 1`,
            [session.workspaceId, `%${digits}%`],
          );
          if (!emp.rows.length) return;
          const { executeCalloffCoverageWorkflow } = await import(
            '../services/trinity/workflows/calloffCoverageWorkflow'
          );
          await executeCalloffCoverageWorkflow({
            workspaceId: session.workspaceId,
            employeeId: emp.rows[0].id,
            triggerSource: 'voice_calloff',
            reason: `Voice calloff (recording ${RecordingSid})`,
          });
        } catch (err: any) {
          log.warn('[VoiceRoutes] Voice calloff workflow error (non-fatal):', err?.message);
        }
      });
    }

    xmlResponse(res, twiml('<Say>Thank you. Goodbye.</Say>'));
  } catch (err: any) {
    log.error('[VoiceRoutes] Recording-done error:', err.message);
    xmlResponse(res, twiml('<Say>Goodbye.</Say>'));
  }
});

// ─── 7b. TRANSCRIPTION DONE ──────────────────────────────────────────────────
// Called by Twilio when transcription of a recording is complete.

voiceRouter.post('/transcription-done', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, TranscriptionText, TranscriptionStatus, RecordingSid, RecordingUrl, From } = req.body;
    const caseType = (req.query.caseType as string) || '';

    if (TranscriptionStatus === 'completed' && TranscriptionText && CallSid) {
      await updateCallSession(CallSid, { transcript: TranscriptionText });
      log.info(`[VoiceRoutes] Transcript saved for callSid=${CallSid} (${TranscriptionText.length} chars)`);

      // Phase 18D — sentiment / priority classification + multi-speaker flag
      try {
        const { classifyAndPersist } = await import('../services/trinityVoice/voicemailSentimentService');
        const sent = await classifyAndPersist({ callSid: CallSid, transcript: TranscriptionText });
        if (sent.priority === 'urgent' || sent.priority === 'high') {
          log.info(`[VoiceRoutes] Voicemail flagged ${sent.priority} for callSid=${CallSid}: ${sent.reasonTerms.join(', ')}`);
        }
        const { estimateSpeakerCountFromTranscript, flagMultipleSpeakers } = await import('../services/trinityVoice/callerIdLookup');
        const speakers = estimateSpeakerCountFromTranscript(TranscriptionText);
        if (speakers > 1) await flagMultipleSpeakers({ callSid: CallSid, speakerCount: speakers });
      } catch (e: any) {
        log.warn('[VoiceRoutes] Sentiment/speaker post-processing failed:', e?.message);
      }

      // Phase 27 — GUEST COMPLAINT INTAKE: persist the transcript as a
      // platform-level support ticket routed to CoAIleague platform support
      // for triage. Support agents then decide whether to forward the
      // complaint to the accused provider (matched on complaint_company) or
      // handle directly.
      if (caseType === 'guest_complaint') {
        try {
          const { pool } = await import('../db');

          // Gather context we captured in earlier steps
          const sessRow = await pool.query(
            `SELECT workspace_id, metadata, caller_number FROM voice_call_sessions WHERE twilio_call_sid = $1 LIMIT 1`,
            [CallSid],
          );
          const meta = (sessRow.rows[0]?.metadata as Record<string, any> | null) || {};
          const complaintCompany: string = meta.complaint_company || '';
          const complaintOfficer: string = meta.complaint_officer || '';
          const callerPhone: string = From || sessRow.rows[0]?.caller_number || '';

          // Pick the CoAIleague platform support workspace as the ticket
          // owner. Falls back to the resolved workspace if not found.
          const platformWs = await pool.query(
            `SELECT id FROM workspaces WHERE name ILIKE '%CoAIleague Support%' OR id = 'coaileague-platform-workspace' LIMIT 1`,
          );
          const targetWorkspaceId: string = platformWs.rows[0]?.id
            || sessRow.rows[0]?.workspace_id
            || 'coaileague-platform-workspace';

          // Generate a ticket number: TKT-GC-YYYYMMDD-XXXXX
          const now = new Date();
          const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
          const ticketNumber = `TKT-GC-${ymd}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

          const subject = complaintOfficer
            ? `Guest complaint: ${complaintOfficer}${complaintCompany ? ` at ${complaintCompany}` : ''}`.slice(0, 200)
            : `Guest complaint${complaintCompany ? ` — ${complaintCompany}` : ''}`.slice(0, 200);

          const description = [
            `Voice-intake guest complaint captured via ${CallSid}.`,
            `Caller phone: ${callerPhone || 'unknown'}`,
            `Named company: ${complaintCompany || '(not provided)'}`,
            `Named officer: ${complaintOfficer || '(not provided)'}`,
            `Recording: ${RecordingUrl || 'n/a'}`,
            '',
            '--- Caller transcript (verbatim) ---',
            TranscriptionText,
          ].join('\n');

          await pool.query(
            `INSERT INTO support_tickets
              (workspace_id, ticket_number, type, priority, requested_by, subject, description,
               status, is_escalated, created_at, updated_at)
             VALUES ($1, $2, 'guest_complaint', 'high', $3, $4, $5, 'open', TRUE, NOW(), NOW())`,
            [targetWorkspaceId, ticketNumber, callerPhone || 'voice-guest', subject, description],
          );

          log.info(`[VoiceRoutes] Guest complaint ticket ${ticketNumber} created for ${callerPhone} (company="${complaintCompany}" officer="${complaintOfficer}")`);

          // Emit platform event so NDS / support console can surface it in real time.
          try {
            const { platformEventBus } = await import('../services/platformEventBus');
            await platformEventBus.publish({
              type: 'support_ticket.created',
              category: 'support',
              title: `Guest complaint intake — ${subject}`,
              description: `Voice-intake complaint from ${callerPhone}. Company: ${complaintCompany || 'unknown'}; Officer: ${complaintOfficer || 'unknown'}.`,
              workspaceId: targetWorkspaceId,
              metadata: { ticketNumber, callSid: CallSid, callerPhone, complaintCompany, complaintOfficer, channel: 'voice' },
            });
          } catch { /* non-fatal */ }
        } catch (gcErr: any) {
          log.error('[VoiceRoutes] Guest complaint persistence failed:', gcErr?.message);
        }
      }

      // Phase 28 — PROVIDER-SCOPED intake case types (client complaint,
      // incident, coverage request, schedule update). Support ticket is
      // created INSIDE the tenant's workspace (not platform support) so
      // the tenant's own team handles it. Priority and subject vary by type.
      const providerScopedTypes: Record<string, { priority: string; labelEn: string; labelEs: string }> = {
        client_complaint:         { priority: 'high',   labelEn: 'Client complaint',          labelEs: 'Queja de cliente' },
        provider_incident:        { priority: 'urgent', labelEn: 'Site incident report',      labelEs: 'Reporte de incidente' },
        provider_coverage_request:{ priority: 'normal', labelEn: 'Coverage request',          labelEs: 'Solicitud de cobertura' },
        provider_schedule_update: { priority: 'normal', labelEn: 'Schedule update request',   labelEs: 'Actualización de horario' },
      };
      if (providerScopedTypes[caseType]) {
        try {
          const { pool } = await import('../db');
          const qsWorkspaceId = (req.query.workspaceId as string) || '';
          const sessRow = await pool.query(
            `SELECT workspace_id, metadata, caller_number FROM voice_call_sessions WHERE twilio_call_sid = $1 LIMIT 1`,
            [CallSid],
          );
          const meta = (sessRow.rows[0]?.metadata as Record<string, any> | null) || {};
          const providerWorkspaceId: string = qsWorkspaceId
            || meta.client_provider_workspace_id
            || sessRow.rows[0]?.workspace_id
            || '';

          if (!providerWorkspaceId) {
            log.warn(`[VoiceRoutes] ${caseType} skipped — no provider workspace in context for callSid=${CallSid}`);
          } else {
            const providerName: string = meta.provider_name || '';
            const complaintOfficer: string = meta.complaint_officer || '';
            const callerPhone: string = From || sessRow.rows[0]?.caller_number || '';

            const now = new Date();
            const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const suffix = caseType === 'client_complaint' ? 'CC'
                          : caseType === 'provider_incident' ? 'INC'
                          : caseType === 'provider_coverage_request' ? 'COV'
                          : 'SCH';
            const ticketNumber = `TKT-${suffix}-${ymd}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            const cfg = providerScopedTypes[caseType];
            const label = (req.query.lang as string) === 'es' ? cfg.labelEs : cfg.labelEn;

            const subject = complaintOfficer && caseType === 'client_complaint'
              ? `${label}: ${complaintOfficer}`.slice(0, 200)
              : label;

            const description = [
              `Voice-intake ${caseType} captured via ${CallSid}.`,
              `Provider workspace: ${providerName || providerWorkspaceId}`,
              `Caller phone: ${callerPhone || 'unknown'}`,
              complaintOfficer ? `Named officer: ${complaintOfficer}` : '',
              `Recording: ${RecordingUrl || 'n/a'}`,
              '',
              '--- Caller transcript (verbatim) ---',
              TranscriptionText,
            ].filter(Boolean).join('\n');

            await pool.query(
              `INSERT INTO support_tickets
                (workspace_id, ticket_number, type, priority, requested_by, subject, description,
                 status, is_escalated, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', FALSE, NOW(), NOW())`,
              [providerWorkspaceId, ticketNumber, caseType, cfg.priority, callerPhone || 'voice-client', subject, description],
            );
            log.info(`[VoiceRoutes] ${caseType} ticket ${ticketNumber} created in tenant workspace ${providerWorkspaceId}`);

            // Tenant-level event so the tenant's own NDS / support console picks it up
            try {
              const { platformEventBus } = await import('../services/platformEventBus');
              await platformEventBus.publish({
                type: 'support_ticket.created',
                category: caseType === 'provider_incident' ? 'operations' : 'support',
                title: `${label}${complaintOfficer ? ` — ${complaintOfficer}` : ''}`,
                description: `Voice-intake ${caseType} from ${callerPhone}.`,
                workspaceId: providerWorkspaceId,
                metadata: { ticketNumber, callSid: CallSid, callerPhone, caseType, channel: 'voice' },
              });
            } catch { /* non-fatal */ }
          }
        } catch (psErr: any) {
          log.error(`[VoiceRoutes] Provider-scoped ${caseType} persistence failed:`, psErr?.message);
        }
      }
    } else if (TranscriptionStatus === 'failed') {
      log.warn(`[VoiceRoutes] Transcription failed for callSid=${CallSid} recordingSid=${RecordingSid}`);
    }

    res.status(200).send();
  } catch (err: any) {
    log.error('[VoiceRoutes] Transcription-done error:', err.message);
    res.status(200).send(); // Always 200 to Twilio
  }
});

// ─── 8. STATUS CALLBACK ───────────────────────────────────────────────────────

voiceRouter.post('/status-callback', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = req.body;

    log.info(`[VoiceRoutes] Status callback: ${CallSid} → ${CallStatus} (${CallDuration}s)`);

    if (CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'failed') {
      const durationSec = parseInt(CallDuration || '0', 10);

      // Update session
      await updateCallSession(CallSid, {
        status: CallStatus,
        endedAt: new Date(),
        durationSeconds: durationSec,
        recordingUrl: RecordingUrl || undefined,
        recordingSid: RecordingSid || undefined,
      });

      // Record call usage for overage billing (flat-rate model — no balance deducted)
      if (CallStatus === 'completed' && durationSec > 0) {
        const [session] = await db.select({
          id: voiceCallSessions.id,
          workspaceId: voiceCallSessions.workspaceId,
          callerNumber: voiceCallSessions.callerNumber,
          metadata: voiceCallSessions.metadata,
        })
          .from(voiceCallSessions)
          .where(eq(voiceCallSessions.twilioCallSid, CallSid))
          .limit(1);

        if (session) {
          const sessionMeta = (session.metadata as Record<string, any> | null) ?? {};
          await recordCallUsage({
            workspaceId: session.workspaceId,
            callSessionId: session.id,
            durationSeconds: durationSec,
            twilioCallSid: CallSid,
            callerNumber: session.callerNumber || undefined,
            outcome: sessionMeta.ai_resolved ? 'ai_resolved'
              : sessionMeta.escalated ? 'escalated'
              : sessionMeta.voicemail ? 'voicemail'
              : 'abandoned',
            aiAttempted: sessionMeta.ai_attempted ?? false,
            extensionHandled: sessionMeta.extension || undefined,
          });

          voiceSmsMeteringService.recordVoiceCall({
            workspaceId: session.workspaceId,
            callSid: CallSid,
            durationSeconds: durationSec,
            direction: 'inbound',
            callType: 'trinity_voice',
            twilioCostCents: Math.ceil((durationSec / 60) * 1.4),
          }).catch((e: Error) => log.warn('[VoiceRoutes] Voice metering error:', e.message));
        }
      }

      // Write call-end audit log
      const [endSession] = await db.select({ id: voiceCallSessions.id, workspaceId: voiceCallSessions.workspaceId })
        .from(voiceCallSessions)
        .where(eq(voiceCallSessions.twilioCallSid, CallSid))
        .limit(1);

      if (endSession) {
        await logCallAction({
          callSessionId: endSession.id,
          workspaceId: endSession.workspaceId,
          action: 'call_ended',
          payload: { callStatus: CallStatus, durationSeconds: durationSec },
          outcome: CallStatus === 'completed' ? 'success' : 'failure',
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }

    res.status(204).send();
  } catch (err: any) {
    log.error('[VoiceRoutes] Status-callback error:', err.message);
    res.status(200).send(); // Always 200 to Twilio
  }
});

// ─── SUPPORT IVR: AI Resolution + Case Creation ───────────────────────────────

/**
 * POST /api/voice/support-resolve
 * Trinity receives the caller's spoken issue and attempts AI resolution.
 * If resolved → speak answer + confirm ("Press 1 yes / Press 2 need human").
 * If not resolved → gather caller name → create case.
 */
voiceRouter.post('/support-resolve', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, SpeechResult, Digits } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    // Phase 25 — client account context passed from clientExtension. Forwarded
    // across retries so the AI brain keeps it until a resolution is attempted.
    const clientContext = decodeURIComponent((req.query.clientContext as string) || '').slice(0, 300);

    // ── Guest session token cap gate ─────────────────────────────────────────
    const isGuestSession = req.query.guest === '1';
    if (isGuestSession) {
      try {
        const { isSessionCapped, recordGuestSessionUsage } = await import(
          '../services/billing/guestSessionService'
        );
        const capped = await isSessionCapped(sessionId);
        if (capped) {
          const capMsg = lang === 'es'
            ? 'He alcanzado mi límite para esta sesión. Le conectaré con un agente humano. Adiós.'
            : "I've reached my session limit. Let me route you to a human agent. Goodbye.";
          return xmlResponse(res, twiml(
            (lang === 'es'
              ? `<Say voice="Polly.Lupe-Neural" language="es-US">${capMsg}</Say>`
              : `<Say voice="Polly.Joanna-Neural" language="en-US">${capMsg}</Say>`)
            + `<Hangup />`
          ));
        }
        await recordGuestSessionUsage({
          workspaceId: workspaceId || PLATFORM_WORKSPACE_ID,
          sessionId,
          guestType: 'general_inquiry',
          channel: 'voice',
          tokensUsed: 300,
        }).catch(() => {});
      } catch (capErr: any) {
        log.warn('[VoiceGuest] cap check failed (non-blocking):', capErr?.message);
      }
    }

    const issue = (SpeechResult || '').trim();

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;
    const sayEs = (text: string) => `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;
    const sayL = (en: string, es: string) => lang === 'es' ? sayEs(es) : sayEn(en);

    if (!issue || issue.length < 5) {
      const ctxParam = clientContext ? `&clientContext=${encodeURIComponent(clientContext)}` : '';
      const action = `${baseUrl}/api/voice/support-resolve?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}${ctxParam}`;
      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${action}" method="POST" timeout="8" speechTimeout="auto">` +
        sayL(
          "I'm sorry, I didn't catch that. Please tell me what you need help with today.",
          "Lo siento, no escuché eso. Por favor dígame en qué puedo ayudarle hoy."
        ) +
        `</Gather>` +
        sayL('Thank you for calling. Goodbye.', 'Gracias por llamar. Adiós.')
      ));
    }

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'support_issue_received',
      payload: { issue: issue.slice(0, 300), hasClientContext: !!clientContext },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Attempt AI resolution (max ~6s) — pass client context into the brain.
    const aiResult = await resolveWithTrinityBrain({ issue, workspaceId, language: lang, clientContext });

    if (aiResult.canResolve) {
      const answer = lang === 'es'
        ? getResolutionConfirmPhraseEs(aiResult.answer)
        : getResolutionConfirmPhraseEn(aiResult.answer);

      const issueEncoded = encodeURIComponent(issue.slice(0, 500));
      const aiAnswerEncoded = encodeURIComponent(aiResult.answer.slice(0, 500));
      const confirmAction = `${baseUrl}/api/voice/support-confirm?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&issue=${issueEncoded}&aiAnswer=${aiAnswerEncoded}&aiModel=${aiResult.modelUsed}`;

      logCallAction({
        callSessionId: sessionId,
        workspaceId,
        action: 'support_ai_resolved',
        payload: { model: aiResult.modelUsed, responseTimeMs: aiResult.responseTimeMs },
        outcome: 'success',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // Workspace-scoped audit log so every Trinity voice AI resolution is
      // visible in the universal audit trail (not just the per-call log).
      try {
        await universalAudit.log({
          workspaceId,
          actorType: 'trinity',
          action: 'trinity.voice_ai_resolved',
          entityType: 'voice_call',
          entityId: sessionId,
          changeType: 'action',
          metadata: {
            model: aiResult.modelUsed,
            responseTimeMs: aiResult.responseTimeMs,
            channel: 'voice',
            extension: 'support',
          },
        });
      } catch (auditErr: any) {
        log.warn('[VoiceRoutes] support-resolve audit failed (non-fatal):', auditErr?.message);
      }

      return xmlResponse(res, twiml(
        `<Gather input="dtmf" action="${confirmAction}" method="POST" numDigits="1" timeout="10">` +
        (lang === 'es' ? sayEs(answer) : sayEn(answer)) +
        `</Gather>` +
        // No input → treat as satisfied
        sayL('Thank you for calling. Have a great day. Goodbye.', 'Gracias por llamar. Que tenga un buen día. Adiós.')
      ));
    }

    // Cannot resolve → escalate to human via name gather
    const escalationPhrase = lang === 'es' ? getEscalationPhraseEs() : getEscalationPhraseEn();
    const namePhrase = lang === 'es' ? getNameGatherPhraseEs() : getNameGatherPhraseEn();
    const issueEncoded = encodeURIComponent(issue.slice(0, 500));
    const nameAction = `${baseUrl}/api/voice/support-gather-name?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&issue=${issueEncoded}&aiAttempted=true&aiModel=${aiResult.modelUsed || 'none'}`;

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'support_ai_escalate',
      payload: { reason: aiResult.escalationReason, model: aiResult.modelUsed },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    return xmlResponse(res, twiml(
      `<Gather input="speech" action="${nameAction}" method="POST" timeout="8" speechTimeout="auto">` +
      (lang === 'es' ? sayEs(escalationPhrase + ' ' + namePhrase) : sayEn(escalationPhrase + ' ' + namePhrase)) +
      `</Gather>` +
      sayL(
        'I did not catch your name. Let me create a support case and our team will reach out to you shortly. Goodbye.',
        'No escuché su nombre. Permítame crear un caso de soporte y nuestro equipo se comunicará con usted pronto. Adiós.'
      )
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] support-resolve error:', err.message);
    xmlResponse(res, twiml('<Say>We encountered a technical issue. Please call back. Goodbye.</Say>'));
  }
});

/**
 * POST /api/voice/support-confirm
 * Caller confirms if the AI answer resolved their issue.
 * Digits=1 → resolved, goodbye. Digits=2 or no input → escalate.
 */
voiceRouter.post('/support-confirm', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const issue = decodeURIComponent((req.query.issue as string) || '');
    const aiAnswer = decodeURIComponent((req.query.aiAnswer as string) || '');
    const aiModel = (req.query.aiModel as string) || 'none';

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;
    const sayEs = (text: string) => `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;
    const sayL = (en: string, es: string) => lang === 'es' ? sayEs(es) : sayEn(en);

    if (Digits === '1') {
      // Mark session as AI-resolved so the status callback can report the correct outcome.
      // Phase 26D — non-blocking but logged on failure.
      scheduleNonBlocking('voice.support-confirm-resolved-metadata', async () => {
        await updateCallSession(CallSid, {
          metadata: { ai_resolved: true, ai_attempted: true, ai_model: aiModel, extension: 'client_support' },
        });
      });
      logCallAction({
        callSessionId: sessionId,
        workspaceId,
        action: 'support_resolved_by_ai',
        payload: { model: aiModel },
        outcome: 'success',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      return xmlResponse(res, twiml(
        sayL(
          'Excellent! I\'m glad I could help. Thank you for calling. Have a wonderful day. Goodbye!',
          '¡Excelente! Me alegra haberle podido ayudar. Gracias por llamar. ¡Que tenga un día maravilloso! Adiós.'
        )
      ));
    }

    // Caller wants human help — mark session as escalated.
    // Phase 26D — non-blocking but logged on failure.
    scheduleNonBlocking('voice.support-confirm-escalated-metadata', async () => {
      await updateCallSession(CallSid, {
        metadata: { ai_resolved: false, ai_attempted: true, escalated: true, ai_model: aiModel, extension: 'client_support' },
      });
    });
    const escalationPhrase = lang === 'es' ? getEscalationPhraseEs() : getEscalationPhraseEn();
    const namePhrase = lang === 'es' ? getNameGatherPhraseEs() : getNameGatherPhraseEn();
    const issueEncoded = encodeURIComponent(issue.slice(0, 500));
    const nameAction = `${baseUrl}/api/voice/support-gather-name?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&issue=${issueEncoded}&aiAttempted=true&aiModel=${aiModel}`;

    return xmlResponse(res, twiml(
      `<Gather input="speech" action="${nameAction}" method="POST" timeout="8" speechTimeout="auto">` +
      (lang === 'es' ? sayEs(escalationPhrase + ' ' + namePhrase) : sayEn(escalationPhrase + ' ' + namePhrase)) +
      `</Gather>` +
      sayL(
        'I did not catch your name. We will create a support case and someone will follow up with you shortly. Goodbye.',
        'No escuché su nombre. Crearemos un caso de soporte y alguien se comunicará con usted pronto. Adiós.'
      )
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] support-confirm error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

/**
 * POST /api/voice/support-gather-name
 * Receives the caller's spoken name. Then asks them to describe the issue
 * (or uses the original issue if already captured).
 */
voiceRouter.post('/support-gather-name', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, SpeechResult } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const issue = decodeURIComponent((req.query.issue as string) || '');
    const aiAttempted = (req.query.aiAttempted as string) === 'true';
    const aiModel = (req.query.aiModel as string) || 'none';

    const callerName = (SpeechResult || '').trim().slice(0, 100) || 'Unknown Caller';

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;
    const sayEs = (text: string) => `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;
    const sayL = (en: string, es: string) => lang === 'es' ? sayEs(es) : sayEn(en);

    if (issue && issue.length >= 5) {
      // We already have the issue from the first gather — create the case now
      const createAction = `${baseUrl}/api/voice/support-create-case?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&issue=${encodeURIComponent(issue.slice(0, 500))}&callerName=${encodeURIComponent(callerName)}&aiAttempted=${aiAttempted}&aiModel=${aiModel}`;

      const thankPhrase = lang === 'es'
        ? getMessageGatherPhraseEs(callerName)
        : getMessageGatherPhraseEn(callerName);

      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${createAction}" method="POST" timeout="30" speechTimeout="3">` +
        (lang === 'es' ? sayEs(thankPhrase) : sayEn(thankPhrase)) +
        `</Gather>` +
        redirect(`${createAction}&skipMessage=true`)
      ));
    }

    // No issue yet — gather it now
    const issueAction = `${baseUrl}/api/voice/support-create-case?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&callerName=${encodeURIComponent(callerName)}&aiAttempted=${aiAttempted}&aiModel=${aiModel}`;
    const describePhrase = lang === 'es'
      ? getMessageGatherPhraseEs(callerName)
      : getMessageGatherPhraseEn(callerName);

    return xmlResponse(res, twiml(
      `<Gather input="speech" action="${issueAction}" method="POST" timeout="30" speechTimeout="3">` +
      (lang === 'es' ? sayEs(describePhrase) : sayEn(describePhrase)) +
      `</Gather>` +
      redirect(`${issueAction}&skipMessage=true`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] support-gather-name error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

/**
 * POST /api/voice/support-create-case
 * Creates the support case, notifies human agents, speaks the cause number.
 */
voiceRouter.post('/support-create-case', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, SpeechResult, To, From } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    const issueFromQS = decodeURIComponent((req.query.issue as string) || '');
    const callerName = decodeURIComponent((req.query.callerName as string) || '').slice(0, 100);
    const aiAttempted = (req.query.aiAttempted as string) === 'true';
    const aiModel = (req.query.aiModel as string) || 'none';
    const skipMessage = (req.query.skipMessage as string) === 'true';

    const spokenMessage = skipMessage ? '' : (SpeechResult || '').trim();

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;
    const sayEs = (text: string) => `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;
    const sayL = (en: string, es: string) => lang === 'es' ? sayEs(es) : sayEn(en);

    // Build the best issue summary we have
    const issueSummary = [issueFromQS, spokenMessage].filter(Boolean).join(' — ').slice(0, 1000)
      || 'Caller requested human assistance. Issue not captured via speech.';

    // Resolve workspace context
    const workspace = To ? await resolveWorkspaceFromPhoneNumber(To) : null;
    const callerNumber = From || req.body.From || '';

    const supportCase = await createSupportCase({
      workspaceId,
      callSessionId: sessionId,
      callerNumber,
      callerName: callerName || undefined,
      issueSummary,
      aiResolutionAttempted: aiAttempted,
      aiModelUsed: aiModel !== 'none' ? aiModel : undefined,
      language: lang,
    });

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'support_case_created',
      payload: { caseNumber: supportCase.case_number, callerName, aiAttempted },
      outcome: 'success',
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Notify agents asynchronously (non-blocking)
    setImmediate(() => {
      notifyHumanAgents({ supportCase, workspaceId }).catch((e: any) => {
        log.warn('[VoiceRoutes] Agent notification failed (non-fatal):', e?.message);
      });
    });

    // ── Post-call SMS confirmation ─────────────────────────────────────────────
    // Send the caller their case number via SMS immediately after the case is
    // created, so they have a written record even after the call ends.
    // Awaited to satisfy "no fire-and-forget" rule (TRINITY.md §9); sendSMS
    // persists to smsAttemptLog regardless of outcome, so failures are logged.
    if (callerNumber && callerNumber.trim().length >= 10) {
      try {
        const { sendSMS } = await import('../services/smsService');
        const orgName = (workspace as any)?.name || 'your organization';
        const smsBody = lang === 'es'
          ? `Hola${callerName ? ` ${callerName.split(' ')[0]}` : ''}, su caso de soporte fue creado: ${supportCase.case_number}. Un especialista de ${orgName} le dará seguimiento pronto. Responda STOP para dejar de recibir mensajes.`
          : `Hi${callerName ? ` ${callerName.split(' ')[0]}` : ''}, your support case has been created: ${supportCase.case_number}. A specialist from ${orgName} will follow up with you shortly. Reply STOP to unsubscribe.`;
        await sendSMS({ to: callerNumber, body: smsBody, workspaceId, type: 'system_alert' });
        log.info(`[VoiceRoutes] Post-call SMS sent to ${callerNumber} — case ${supportCase.case_number}`);
      } catch (smsErr: any) {
        log.warn(`[VoiceRoutes] Post-call SMS failed (non-fatal): ${smsErr?.message}`);
      }
    }

    // Speak the cause number to the caller
    const casePhrase = lang === 'es'
      ? getCaseCreatedPhraseEs(supportCase.case_number)
      : getCaseCreatedPhraseEn(supportCase.case_number);

    return xmlResponse(res, twiml(
      (lang === 'es' ? sayEs(casePhrase) : sayEn(casePhrase))
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] support-create-case error:', err.message);
    xmlResponse(res, twiml(
      '<Say>I was unable to create a support case at this time. Please call back or reach out by email. Goodbye.</Say>'
    ));
  }
});

/**
 * POST /api/voice/case-check
 * Caller speaks or dials their cause number to check case status.
 */
voiceRouter.post('/case-check', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { SpeechResult, Digits } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;
    const sayEs = (text: string) => `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;
    const sayL = (en: string, es: string) => lang === 'es' ? sayEs(es) : sayEn(en);

    // Try to extract a case number from speech or DTMF
    const raw = (SpeechResult || Digits || '').trim().toUpperCase();
    const caseNumber = raw.replace(/[^A-Z0-9\-]/g, '').replace(/^(CSP|CASE)/i, 'CSP-').replace(/CSP(\d)/, 'CSP-$1');

    if (!caseNumber || caseNumber.length < 8) {
      const checkAction = `${baseUrl}/api/voice/case-check?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${checkAction}" method="POST" timeout="10" speechTimeout="auto">` +
        sayL(
          'Please say or enter your cause number. For example: C S P, dash, 2 0 2 6 0 3 3 0, dash, 0 0 4 2.',
          'Por favor diga o ingrese su número de causa. Por ejemplo: C S P, guión, 2 0 2 6 0 3 3 0, guión, 0 0 4 2.'
        ) +
        `</Gather>` +
        sayL('Case number not received. Goodbye.', 'Número de causa no recibido. Adiós.')
      ));
    }

    const supportCase = await findCaseByNumber(caseNumber, workspaceId);
    if (!supportCase) {
      return xmlResponse(res, twiml(
        sayL(
          `I could not find a case with the number ${caseNumber.split('').join(' ')}. Please verify your number and try again. Goodbye.`,
          `No pude encontrar un caso con el número ${caseNumber.split('').join(' ')}. Por favor verifique su número e intente de nuevo. Adiós.`
        )
      ));
    }

    const statusText = {
      open: lang === 'es' ? 'abierto, pendiente de respuesta de un agente' : 'open and awaiting response from a support agent',
      in_progress: lang === 'es' ? 'en progreso. Un agente está trabajando en ello' : 'in progress. A support agent is working on it',
      resolved: lang === 'es' ? 'resuelto' : 'resolved',
    }[supportCase.status] || supportCase.status;

    const resolvedNote = supportCase.status === 'resolved'
      ? (lang === 'es'
        ? ` Fue resuelto el ${new Date(supportCase.resolved_at!).toLocaleDateString()}.`
        : ` It was resolved on ${new Date(supportCase.resolved_at!).toLocaleDateString()}.`)
      : '';

    return xmlResponse(res, twiml(
      sayL(
        `Your case ${supportCase.case_number.split('').join(' ')} is currently ${statusText}.${resolvedNote} Thank you for calling. Have a great day.`,
        `Su caso ${supportCase.case_number.split('').join(' ')} está actualmente ${statusText}.${resolvedNote} Gracias por llamar. Que tenga un buen día.`
      )
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] case-check error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

/**
 * POST /api/voice/agent-clear
 * Human agents call in to resolve a case via voice (PIN-gated).
 * Flow: dial the number → press 0 → enter agent PIN → say or enter case number → confirm resolution.
 */
voiceRouter.post('/agent-clear', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { SpeechResult, Digits, To } = req.body;
    const { sessionId, workspaceId: wsFromQS } = extractQS(req);
    const baseUrl = getBaseUrl(req);

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

    // Resolve workspace from phone number if workspaceId not in QS
    let workspaceId = wsFromQS;
    if (!workspaceId && To) {
      const ws = await resolveWorkspaceFromPhoneNumber(To);
      workspaceId = ws?.workspaceId || '';
    }
    if (!workspaceId) {
      return xmlResponse(res, twiml(sayEn('Unable to identify workspace. Goodbye.')));
    }

    const step = (req.query.step as string) || 'pin';
    const agentPin = process.env.VOICE_AGENT_CLEAR_PIN || '7890';

    if (step === 'pin') {
      const caseAction = `${baseUrl}/api/voice/agent-clear?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}&step=case`;
      const enteredPin = (Digits || '').trim();

      if (!enteredPin) {
        return xmlResponse(res, twiml(
          `<Gather input="dtmf" action="${baseUrl}/api/voice/agent-clear?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}&step=pin" method="POST" numDigits="4" timeout="10">` +
          sayEn('Agent case management. Please enter your 4-digit PIN.') +
          `</Gather>` +
          sayEn('No PIN entered. Goodbye.')
        ));
      }

      if (enteredPin !== agentPin) {
        return xmlResponse(res, twiml(sayEn('Incorrect PIN. Goodbye.')));
      }

      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${caseAction}" method="POST" timeout="12" speechTimeout="auto">` +
        sayEn('PIN accepted. Please say or enter the case number to resolve.') +
        `</Gather>` +
        sayEn('No case number received. Goodbye.')
      ));
    }

    if (step === 'case') {
      const raw = (SpeechResult || Digits || '').trim().toUpperCase();
      const caseNumber = raw.replace(/[^A-Z0-9\-]/g, '');

      if (!caseNumber || caseNumber.length < 8) {
        return xmlResponse(res, twiml(sayEn('Invalid case number. Please call back and try again. Goodbye.')));
      }

      const supportCase = await findCaseByNumber(caseNumber, workspaceId);
      if (!supportCase) {
        return xmlResponse(res, twiml(sayEn(`Case ${caseNumber.split('').join(' ')} not found. Goodbye.`)));
      }
      if (supportCase.status === 'resolved') {
        return xmlResponse(res, twiml(sayEn(`Case ${caseNumber.split('').join(' ')} is already resolved. Goodbye.`)));
      }

      const confirmAction = `${baseUrl}/api/voice/agent-clear?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}&step=confirm&caseNumber=${encodeURIComponent(caseNumber)}`;

      return xmlResponse(res, twiml(
        `<Gather input="dtmf" action="${confirmAction}" method="POST" numDigits="1" timeout="10">` +
        sayEn(`Found case ${supportCase.case_number.split('').join(' ')} for ${supportCase.caller_name || 'unknown caller'}. Press 1 to mark as resolved, or 2 to cancel.`) +
        `</Gather>` +
        sayEn('No input received. Goodbye.')
      ));
    }

    if (step === 'confirm') {
      const caseNumber = decodeURIComponent((req.query.caseNumber as string) || '');
      const resolved = Digits === '1';

      if (!resolved) {
        return xmlResponse(res, twiml(sayEn('Resolution cancelled. Goodbye.')));
      }

      const resolvedCase = await resolveSupportCase({
        caseNumber,
        workspaceId,
        resolvedBy: 'voice_agent',
        resolutionNotes: 'Resolved via voice agent clear IVR',
      });

      if (!resolvedCase) {
        return xmlResponse(res, twiml(sayEn('Unable to resolve case. Please try again. Goodbye.')));
      }

      logCallAction({
        callSessionId: sessionId,
        workspaceId,
        action: 'support_case_resolved_via_voice',
        payload: { caseNumber },
        outcome: 'success',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      return xmlResponse(res, twiml(
        sayEn(`Case ${resolvedCase.case_number.split('').join(' ')} has been marked as resolved. Thank you. Goodbye.`)
      ));
    }

    xmlResponse(res, twiml(sayEn('Invalid step. Goodbye.')));
  } catch (err: any) {
    log.error('[VoiceRoutes] agent-clear error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 9. VOICE STATUS ALIAS ────────────────────────────────────────────────────
// Twilio dashboard may display the callback URL as /status — alias to /status-callback.

voiceRouter.post('/status', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = req.body;
    log.info(`[VoiceRoutes] Status (alias) callback: ${CallSid} → ${CallStatus} (${CallDuration}s)`);

    if (CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'failed') {
      const durationSec = parseInt(CallDuration || '0', 10);
      await updateCallSession(CallSid, {
        status: CallStatus,
        endedAt: new Date(),
        durationSeconds: durationSec,
        recordingUrl: RecordingUrl || undefined,
        recordingSid: RecordingSid || undefined,
      });
      if (CallStatus === 'completed' && durationSec > 0) {
        const [session] = await db.select({ id: voiceCallSessions.id, workspaceId: voiceCallSessions.workspaceId })
          .from(voiceCallSessions)
          .where(eq(voiceCallSessions.twilioCallSid, CallSid))
          .limit(1);
        if (session) {
          voiceSmsMeteringService.recordVoiceCall({
            workspaceId: session.workspaceId,
            callSid: CallSid,
            durationSeconds: durationSec,
            direction: 'inbound',
            callType: 'trinity_voice',
            twilioCostCents: Math.ceil((durationSec / 60) * 1.4),
          }).catch((e: Error) => log.warn('[VoiceRoutes] Status alias metering error:', e.message));
        }
      }
    }
    res.status(200).send();
  } catch (err: any) {
    log.error('[VoiceRoutes] Status alias error:', err.message);
    res.status(200).send();
  }
});

// ─── 10. SMS INBOUND WEBHOOK ──────────────────────────────────────────────────
// POST /api/voice/sms-inbound — Twilio calls this for every inbound SMS.
// Handles STOP / UNSTOP / HELP per TCPA. No auth — validated by Twilio HMAC.

voiceRouter.post('/sms-inbound', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { From, To, Body, MessageSid } = req.body;
    const body = (Body || '').trim().toUpperCase();

    log.info(`[VoiceRoutes] SMS inbound from=${From} to=${To} body="${Body}" sid=${MessageSid}`);

    // STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT — auto opt-out
    if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(body)) {
      try {
        const { pool } = await import('../db');
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE employees SET sms_consent = false WHERE phone = $1 OR phone = $2`,
            [From, From.replace('+1', '')]
          );
        } finally { client.release(); }
      } catch (e: any) {
        log.warn('[VoiceRoutes] SMS STOP db update failed:', e.message);
      }
      res.type('text/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from ${PLATFORM.name} workforce alerts. Reply START to re-subscribe. Msg&amp;Data rates may apply.</Message></Response>`
      );
      return;
    }

    // ── SUBSCRIPTION GATE ────────────────────────────────────────────────────
    // Resolve workspace from the dialed number (To) to verify subscription
    // status before invoking any Trinity-capable path (shift offers, keyword
    // router, AI auto-resolver). STOP is handled above for TCPA compliance
    // regardless of subscription state. Protected workspaces (platform +
    // grandfathered) always pass.
    const smsWorkspace = await resolveWorkspaceFromPhoneNumber(To);
    if (smsWorkspace && !smsWorkspace.isProtected && !isSubscriptionActive(smsWorkspace.subscriptionStatus)) {
      log.warn(`[VoiceRoutes] Blocked SMS from inactive workspace ${smsWorkspace.workspaceId} (${smsWorkspace.subscriptionStatus})`);

      // Record the block in the universal audit trail so tenant owners can
      // see turned-away SMS alongside AI-resolved ones.
      try {
        await universalAudit.log({
          workspaceId: smsWorkspace.workspaceId,
          actorType: 'system',
          action: 'trinity.subscription_gate_blocked',
          entityType: 'sms_message',
          entityId: MessageSid || null,
          changeType: 'action',
          metadata: {
            channel: 'sms',
            subscriptionStatus: smsWorkspace.subscriptionStatus,
            subscriptionTier: smsWorkspace.subscriptionTier,
            fromPhone: From,
            toPhone: To,
            recoverable: isSubscriptionSuspended(smsWorkspace.subscriptionStatus),
          },
        });
      } catch (auditErr: any) {
        log.warn('[VoiceRoutes] SMS subscription-gate audit failed (non-fatal):', auditErr?.message);
      }

      res.type('text/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>` +
        `We're unable to process your request at this time. Please contact your organization's administrator. — Trinity` +
        `</Message></Response>`
      );
      return;
    }
    // ── END SUBSCRIPTION GATE ────────────────────────────────────────────────

    // YES / Y / ACCEPT — first check if it's a shift offer acceptance.
    // Fall back to opt-in handling only if there's no live offer.
    if (['YES', 'Y', 'ACCEPT', 'ACCEPTED'].includes(body)) {
      try {
        const { acceptShiftOffer } = await import('../services/trinityVoice/trinityShiftOfferService');
        const reply = await acceptShiftOffer({ fromPhone: From });
        if (reply) {
          const safe = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          res.type('text/xml').send(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
          );
          return;
        }
      } catch (err: any) {
        log.warn('[VoiceRoutes] Shift offer accept error (non-fatal):', err.message);
      }
      // No live shift offer — treat YES/Y as opt-in (existing behavior). ACCEPT
      // never falls through to opt-in.
      if (body === 'ACCEPT' || body === 'ACCEPTED') {
        res.type('text/xml').send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks! No active shift offer was found for your number. We'll text you when the next opportunity comes up. — Trinity</Message></Response>`
        );
        return;
      }
    }

    // NO / N / DENY / DECLINE — decline a live shift offer if one exists.
    if (['NO', 'N', 'DENY', 'DECLINE', 'DECLINED'].includes(body)) {
      try {
        const { declineShiftOffer } = await import('../services/trinityVoice/trinityShiftOfferService');
        const reply = await declineShiftOffer({ fromPhone: From });
        if (reply) {
          const safe = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          res.type('text/xml').send(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
          );
          return;
        }
      } catch (err: any) {
        log.warn('[VoiceRoutes] Shift offer decline error (non-fatal):', err.message);
      }
    }

    // Phase 18B+ — Trinity SMS keyword router. Recognized command keywords are
    // tried before the AI auto-resolver so phone-only fallback flows (clock in,
    // clock out, complaint, request, verify) can be reliably reached even when
    // the platform is unreachable from the user's device.
    try {
      const { handleTrinitySmsKeyword } = await import('../services/trinityVoice/trinitySmsKeywordRouter');
      const keyworded = await handleTrinitySmsKeyword({ fromPhone: From, rawBody: Body || '', baseUrl: getBaseUrl(req) });
      if (keyworded) {
        const safe = keyworded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        res.type('text/xml').send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
        );
        return;
      }
    } catch (err: any) {
      log.warn('[VoiceRoutes] SMS keyword router error (non-fatal):', err.message);
    }

    // START / UNSTOP / YES — re-opt-in
    if (['START', 'UNSTOP', 'YES'].includes(body)) {
      try {
        const { pool } = await import('../db');
        const client = await pool.connect();
        try {
          await client.query(
            `UPDATE employees SET sms_consent = true WHERE phone = $1 OR phone = $2`,
            [From, From.replace('+1', '')]
          );
        } finally { client.release(); }
      } catch (e: any) {
        log.warn('[VoiceRoutes] SMS START db update failed:', e.message);
      }
      res.type('text/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have re-subscribed to ${PLATFORM.name} workforce alerts. Msg&amp;Data rates may apply. Reply STOP to opt out.</Message></Response>`
      );
      return;
    }

    // HELP — regulatory required response
    if (body === 'HELP') {
      res.type('text/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${PLATFORM.name} Workforce Alerts: shift reminders and operational notifications. Msg freq varies. Msg&amp;Data rates may apply. Reply STOP to cancel. ${PLATFORM.domain}/sms-consent</Message></Response>`
      );
      return;
    }

    // Phase 18D — abuse prevention gate (rate limit + failure welfare check).
    // Runs AFTER the TCPA keyword handlers (STOP / HELP / START) so nothing
    // blocks regulatory replies, but BEFORE the auto-resolver so we stop
    // consuming AI cycles on a throttled phone.
    try {
      const { checkAndRecordRate, rateLimitMessage } = await import(
        '../services/trinityVoice/smsAbusePrevention'
      );
      const gate = await checkAndRecordRate(From, body);
      if (!gate.allowed) {
        const safe = rateLimitMessage().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        res.type('text/xml').send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
        );
        return;
      }
    } catch (abuseErr: any) {
      log.warn('[VoiceRoutes] SMS abuse check failed (non-fatal):', abuseErr?.message);
    }

    // All other inbound SMS — run through Trinity SMS auto-resolver
    try {
      const { resolveInboundSms } = await import('../services/trinityVoice/smsAutoResolver');
      const result = await resolveInboundSms({ fromPhone: From, message: Body || '' });
      if (result.reply) {
        const safeReply = result.reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        res.type('text/xml').send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safeReply}</Message></Response>`
        );
        return;
      }
    } catch (resolverErr: any) {
      log.warn('[VoiceRoutes] SMS auto-resolver failed (non-fatal):', resolverErr?.message);
    }

    // Fallback acknowledgement
    res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (err: any) {
    log.error('[VoiceRoutes] SMS inbound error:', err.message);
    res.status(200).type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
});

// ─── 11. SMS STATUS WEBHOOK ───────────────────────────────────────────────────
// POST /api/voice/sms-status — Twilio calls this with delivery status updates.
// No auth — validated by Twilio HMAC.

voiceRouter.post('/sms-status', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus, To, From, ErrorCode } = req.body;
    log.info(`[VoiceRoutes] SMS status: sid=${MessageSid} status=${MessageStatus} to=${To} err=${ErrorCode || 'none'}`);

    if (ErrorCode) {
      log.warn(`[VoiceRoutes] SMS delivery error: sid=${MessageSid} code=${ErrorCode} to=${To}`);
    }

    // Log to voice_sms_event_log if table exists
    try {
      const { pool } = await import('../db');
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO voice_sms_event_log (event_type, twilio_sid, direction, to_number, from_number, status, error_code, metadata, created_at)
           VALUES ('sms_status', $1, 'outbound', $2, $3, $4, $5, $6, NOW())
           ON CONFLICT DO NOTHING`,
          [MessageSid, To, From, MessageStatus, ErrorCode || null, JSON.stringify(req.body)]
        );
      } finally { client.release(); }
    } catch (e: any) {
      log.warn('[VoiceRoutes] SMS status log failed (table may not exist):', e.message);
    }

    res.status(200).send();
  } catch (err: any) {
    log.error('[VoiceRoutes] SMS status webhook error:', err.message);
    res.status(200).send();
  }
});

// ─── 12. PHASE 21 — VOICE 2FA: SEND VERIFICATION CODE ────────────────────────
// POST /api/voice/send-verification — emails a 6-digit code to the employee
// when their phone number is on file but not yet linked to a user account.

voiceRouter.post('/send-verification', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { Digits } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const employeeId = (req.query.employeeId as string) || '';
    const sessionId = (req.query.sessionId as string) || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    if (Digits !== '1' || !employeeId) {
      return xmlResponse(res, twiml(redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)));
    }

    const { sendVerificationCode } = await import('../services/trinityVoice/voiceVerificationCodeService');
    const result = await sendVerificationCode({ employeeId, workspaceId, lang });

    if (!result.sent) {
      const rateLimited = result.reason === 'rate_limited';
      const failMsg = rateLimited
        ? (lang === 'es'
            ? 'Ha solicitado varios códigos recientemente. Por favor espere unos minutos antes de intentar de nuevo. Pasando al menú general.'
            : 'You\'ve requested several codes recently. Please wait a few minutes before trying again. Taking you to the general menu.')
        : (lang === 'es'
            ? 'Lo siento, no pude enviar el código en este momento. Pasando al menú general.'
            : 'I\'m sorry, I could not send the code at this time. Taking you to the general menu.');
      return xmlResponse(res, twiml(
        say(failMsg, voiceId, langCode) +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    const verifyAction = `${baseUrl}/api/voice/verify-code?employeeId=${encodeURIComponent(employeeId)}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&attempt=1`;
    const promptMsg = lang === 'es'
      ? 'Su código ha sido enviado. Por favor ingrese los seis dígitos ahora.'
      : 'Your code has been sent. Please enter the six digits now.';

    return xmlResponse(res, twiml(
      `<Gather input="dtmf" numDigits="6" timeout="30" action="${verifyAction}" method="POST">` +
      say(promptMsg, voiceId, langCode) +
      `</Gather>` +
      say(lang === 'es' ? 'No se recibió ningún código. Adiós.' : 'No code received. Goodbye.', voiceId, langCode)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] send-verification error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// POST /api/voice/verify-code — validates the entered code and either marks
// the session as verified-by-2fa or offers a single retry.

voiceRouter.post('/verify-code', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const employeeId = (req.query.employeeId as string) || '';
    const sessionId = (req.query.sessionId as string) || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const attempt = Math.max(1, parseInt((req.query.attempt as string) || '1', 10));
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    const submitted = (Digits || '').trim();
    if (!employeeId || submitted.length !== 6) {
      const msg = lang === 'es' ? 'Código inválido. Adiós.' : 'Invalid code. Goodbye.';
      return xmlResponse(res, twiml(say(msg, voiceId, langCode)));
    }

    const { verifyCode } = await import('../services/trinityVoice/voiceVerificationCodeService');
    const ok = await verifyCode(employeeId, submitted);

    if (ok) {
      // Phase 26D — 2FA-verified is a security-relevant flag. Await it but
      // catch non-fatally so a metadata write hiccup doesn't abort the TwiML
      // response the caller is waiting on.
      try {
        await updateCallSession(CallSid, {
          metadata: { verified_by: '2fa_email', employee_id: employeeId },
        });
      } catch (metaErr: any) {
        log.warn('[VoiceRoutes] 2fa-verify session metadata write failed (non-fatal):', metaErr?.message);
      }
      logCallAction({
        callSessionId: sessionId,
        workspaceId,
        action: '2fa_verified',
        payload: { employeeId, channel: 'email' },
        outcome: 'success',
      }).catch((e: any) => log.warn('[VoiceRoutes] 2fa audit log failed:', e?.message));

      const okMsg = lang === 'es'
        ? '¡Identidad verificada! Pasando a su menú personalizado ahora.'
        : 'Identity verified! Taking you to your personalized menu now.';
      return xmlResponse(res, twiml(
        say(okMsg, voiceId, langCode) +
        redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}&_d=4`)
      ));
    }

    if (attempt >= 2) {
      const failMsg = lang === 'es'
        ? 'Código incorrecto. Pasando al menú general.'
        : 'That code didn\'t match. Taking you to the general menu.';
      return xmlResponse(res, twiml(
        say(failMsg, voiceId, langCode) +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    const retryAction = `${baseUrl}/api/voice/verify-code?employeeId=${encodeURIComponent(employeeId)}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&attempt=${attempt + 1}`;
    const retryMsg = lang === 'es'
      ? 'Ese código no coincidió. Por favor intente de nuevo.'
      : 'That code didn\'t match. Please try again.';
    return xmlResponse(res, twiml(
      `<Gather input="dtmf" numDigits="6" timeout="30" action="${retryAction}" method="POST">` +
      say(retryMsg, voiceId, langCode) +
      `</Gather>` +
      redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] verify-code error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 13. PHASE 21 — TRINITY-TALK: FREE CONVERSATIONAL MODE ───────────────────
// POST /api/voice/trinity-talk — guests can simply speak their question to
// Trinity. Routes through the full Trinity AI resolver, then loops up to 5
// turns before escalating to a support case.

async function runTrinityTalkTurn(params: {
  issue: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  turn: number;
  baseUrl: string;
}): Promise<string> {
  const { issue, sessionId, workspaceId, lang, turn, baseUrl } = params;
  const voiceId = lang === 'es' ? VOICE_ES : VOICE;
  const langCode = lang === 'es' ? 'es-US' : 'en-US';

  logCallAction({
    callSessionId: sessionId,
    workspaceId,
    action: 'trinity_talk_turn',
    payload: { turn, issue: issue.slice(0, 300) },
  }).catch((e: any) => log.warn('[VoiceRoutes] trinity-talk audit failed:', e?.message));

  // Phase 25 — load prior-turn memory from the voice_call_sessions metadata
  // so Trinity remembers what was already said in this call. The sessionId
  // threaded through the talk URL can be either a voice_call_sessions.id or
  // the Twilio CallSid (see the `session?.id || CallSid` fallback upstream),
  // so match on either.
  let conversationHistory = '';
  let priorTurns: Array<{ issue: string; answer: string }> = [];
  if (turn > 1 && sessionId) {
    try {
      const { pool } = await import('../db');
      const r = await pool.query(
        `SELECT metadata FROM voice_call_sessions
          WHERE id = $1 OR twilio_call_sid = $1
          LIMIT 1`,
        [sessionId]
      );
      const meta = (r.rows[0]?.metadata ?? {}) as Record<string, unknown>;
      const hist = Array.isArray((meta as any).talkHistory) ? (meta as any).talkHistory : [];
      priorTurns = hist.slice(-5);
      if (priorTurns.length > 0) {
        const last3 = priorTurns.slice(-3);
        conversationHistory = '\n\nPrior conversation:\n' + last3
          .map((t) => `Caller: "${t.issue}"\nTrinity: "${t.answer}"`)
          .join('\n');
      }
    } catch (e: any) {
      log.warn('[VoiceRoutes] trinity-talk memory load failed (non-fatal):', e?.message);
    }
  }

  const aiResult = await resolveWithTrinityBrain({
    issue: issue + conversationHistory,
    workspaceId,
    language: lang,
  });

  // Phase 25 — persist this turn into metadata.talkHistory (keep last 5)
  if (aiResult.canResolve && sessionId) {
    try {
      const { pool } = await import('../db');
      const nextHistory = [
        ...priorTurns,
        { issue: issue.slice(0, 200), answer: aiResult.answer.slice(0, 200) },
      ].slice(-5);
      await pool.query(
        `UPDATE voice_call_sessions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('talkHistory', $1::jsonb),
                updated_at = NOW()
          WHERE id = $2 OR twilio_call_sid = $2`,
        [JSON.stringify(nextHistory), sessionId]
      );
    } catch (e: any) {
      log.warn('[VoiceRoutes] trinity-talk memory save failed (non-fatal):', e?.message);
    }
  }

  // Workspace-scoped audit log for every resolved Trinity-talk turn, so AI
  // invocations on this channel are visible in the universal audit trail.
  if (aiResult.canResolve) {
    try {
      await universalAudit.log({
        workspaceId,
        actorType: 'trinity',
        action: 'trinity.voice_ai_resolved',
        entityType: 'voice_call',
        entityId: sessionId,
        changeType: 'action',
        metadata: {
          model: aiResult.modelUsed,
          responseTimeMs: aiResult.responseTimeMs,
          channel: 'voice',
          extension: 'trinity_talk',
          turn,
        },
      });
    } catch (auditErr: any) {
      log.warn('[VoiceRoutes] trinity-talk audit failed (non-fatal):', auditErr?.message);
    }
  }

  const issueEncoded = encodeURIComponent(issue.slice(0, 500));
  const nameAction = `${baseUrl}/api/voice/support-gather-name?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&issue=${issueEncoded}&aiAttempted=true&aiModel=${aiResult.modelUsed || 'none'}`;
  const escalationPhrase = lang === 'es' ? getEscalationPhraseEs() : getEscalationPhraseEn();
  const namePhrase = lang === 'es' ? getNameGatherPhraseEs() : getNameGatherPhraseEn();

  // If the AI cannot resolve it, or we've reached the 5-turn ceiling, stop
  // looping and escalate directly to a support case. `aiResult.answer` is
  // empty when resolveWithTrinityBrain short-circuits on the subscription
  // gate — use a graceful fallback so the caller hears a real sentence
  // instead of dead air before the escalation gather.
  if (!aiResult.canResolve || turn >= 5) {
    const spokenAnswer = aiResult.answer && aiResult.answer.trim().length > 0
      ? aiResult.answer
      : (lang === 'es'
          ? 'Déjame conectarte con un especialista humano que podrá ayudarte.'
          : 'Let me connect you with a human specialist who can help.');
    return twiml(
      say(spokenAnswer, voiceId, langCode) +
      `<Gather input="speech" action="${nameAction}" method="POST" timeout="8" speechTimeout="auto">` +
      say(escalationPhrase + ' ' + namePhrase, voiceId, langCode) +
      `</Gather>` +
      redirect(`${nameAction}&skipMessage=true`)
    );
  }

  const confirmAction = `${baseUrl}/api/voice/trinity-talk-confirm?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&turn=${turn + 1}&issue=${issueEncoded}&aiModel=${aiResult.modelUsed || 'none'}`;
  const followUpPrompt = lang === 'es'
    ? `${aiResult.answer} ¿Le ayudó eso? Marque 1 si sí, o simplemente haga otra pregunta y le escucharé.`
    : `${aiResult.answer} Was that helpful? Press 1 for yes, or just ask another question and I'll keep listening.`;

  return twiml(
    `<Gather input="speech dtmf" numDigits="1" action="${confirmAction}" method="POST" timeout="10" speechTimeout="auto">` +
    say(followUpPrompt, voiceId, langCode) +
    `</Gather>` +
    redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
  );
}

voiceRouter.post('/trinity-talk', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { SpeechResult, To } = req.body;
    const { sessionId, workspaceId: wsFromQs } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const turn = Math.max(1, parseInt((req.query.turn as string) || '1', 10));
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    let workspaceId = wsFromQs;
    if (!workspaceId && To) {
      const ws = await resolveWorkspaceFromPhoneNumber(To);
      if (ws) workspaceId = ws.workspaceId;
    }
    if (!workspaceId) {
      return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));
    }

    const issue = (SpeechResult || '').trim();

    // ── Phase 29 — PANIC KEYWORD DETECTION ───────────────────────────────────
    // If a caller speaks a life-safety keyword, short-circuit the AI turn:
    // (1) publish panic_alert.voice event so on-call dispatch is paged
    // (2) create a high-priority support ticket capturing the spoken phrase
    // (3) verbally confirm help is being alerted, then hand off to the
    //     schedule-callback flow which connects to a human queue.
    // We only detect panic in the FIRST turn to avoid false positives once
    // the caller is already talking with Trinity about unrelated topics.
    if (issue && turn === 1) {
      const panicEn = /\b(help me|emergency|nine[- ]one[- ]one|9\s?1\s?1|call\s+police|danger|being attacked|shooting|shooter|gun|stabb|hurt|bleeding|dying|kidnap|suicide|overdose)\b/i;
      const panicEs = /\b(ayuda|socorro|emergencia|peligro|disparo|arma|herido|sangrando|muriendo|secuestr|suicid)\b/i;
      const isPanic = panicEn.test(issue) || panicEs.test(issue);
      if (isPanic) {
        log.warn(`[VoiceRoutes] PANIC keyword detected callSid=${req.body.CallSid} phrase="${issue.slice(0, 140)}"`);

        // Fire the platform event — Trinity event subscribers notify the
        // workspace on-call manager + write to thalamic_log as critical.
        try {
          const { platformEventBus } = await import('../services/platformEventBus');
          await platformEventBus.publish({
            type: 'panic_alert.voice',
            category: 'safety',
            title: '🚨 Voice-Caller Panic Keyword Detected',
            description: `Caller spoke panic keyword on live call. Verbatim: "${issue.slice(0, 280)}"`,
            workspaceId,
            metadata: {
              callSid: req.body.CallSid,
              callerNumber: (req.body.From as string) || '',
              transcriptSnippet: issue.slice(0, 500),
              channel: 'voice',
              detectedAt: new Date().toISOString(),
            },
          });
        } catch (evErr: any) {
          log.warn('[VoiceRoutes] panic_alert.voice publish failed:', evErr?.message);
        }

        // Create a HIGH-priority support ticket so the operations console
        // sees the incident even if NDS/email fails.
        try {
          const { pool } = await import('../db');
          const now = new Date();
          const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
          const ticketNumber = `TKT-PANIC-${ymd}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          await pool.query(
            `INSERT INTO support_tickets
              (workspace_id, ticket_number, type, priority, requested_by, subject, description,
               status, is_escalated, created_at, updated_at)
             VALUES ($1, $2, 'panic_voice', 'urgent', $3, $4, $5, 'open', TRUE, NOW(), NOW())`,
            [
              workspaceId,
              ticketNumber,
              (req.body.From as string) || 'voice-caller',
              `🚨 Panic keyword on voice call (${req.body.CallSid})`.slice(0, 200),
              [
                `Voice-caller panic keyword detected.`,
                `Caller: ${(req.body.From as string) || 'unknown'}`,
                `CallSid: ${req.body.CallSid}`,
                '',
                '--- Caller verbatim ---',
                issue,
              ].join('\n'),
            ],
          );
        } catch (tkErr: any) {
          log.warn('[VoiceRoutes] panic ticket insert failed:', tkErr?.message);
        }

        const reassureMsg = lang === 'es'
          ? 'Le escucho. Mantenga la calma. Estoy alertando al despacho de su proveedor y a su supervisor en este mismo momento. Si está en peligro inmediato, por favor llame al nueve uno uno. Quedo con usted.'
          : "I hear you. Stay with me. I'm alerting your provider's dispatch and your supervisor right now. If you are in immediate danger, please call nine one one. I am staying with you.";
        return xmlResponse(res, twiml(
          say(reassureMsg, voiceId, langCode) +
          redirect(`${baseUrl}/api/voice/schedule-callback?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&priority=urgent`)
        ));
      }
    }

    if (!issue || issue.length < 3) {
      const reprompt = lang === 'es'
        ? 'No le escuché. Por favor dígame en qué puedo ayudarle.'
        : 'I didn\'t catch that. Please tell me what I can help you with.';
      const action = `${baseUrl}/api/voice/trinity-talk?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&turn=${turn}`;
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${action}" method="POST" timeout="12" speechTimeout="auto">` +
        say(reprompt, voiceId, langCode) +
        `</Gather>` +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    const xml = await runTrinityTalkTurn({ issue, sessionId, workspaceId, lang, turn, baseUrl });
    xmlResponse(res, xml);
  } catch (err: any) {
    log.error('[VoiceRoutes] trinity-talk error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// POST /api/voice/trinity-talk-confirm — handles "was that helpful?" reply.
// Press 1 → satisfied, goodbye. Speech → treat as next question and run the
// next AI turn inline (preserves the caller's speech across the round-trip).

voiceRouter.post('/trinity-talk-confirm', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { Digits, SpeechResult } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const turn = Math.max(2, parseInt((req.query.turn as string) || '2', 10));
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    if (!workspaceId) {
      return xmlResponse(res, twiml('<Say>Configuration error. Goodbye.</Say>'));
    }

    if (Digits === '1') {
      const goodbye = lang === 'es'
        ? '¡Excelente! Me alegra haberle podido ayudar. Que tenga un día maravilloso. Adiós.'
        : 'Wonderful! I\'m glad I could help. Have a great day. Goodbye.';
      return xmlResponse(res, twiml(say(goodbye, voiceId, langCode)));
    }

    // Treat speech as the next question — run the AI turn inline so the
    // caller's words aren't lost on a Twilio round-trip.
    const next = (SpeechResult || '').trim();
    if (next && next.length >= 3) {
      const xml = await runTrinityTalkTurn({
        issue: next,
        sessionId,
        workspaceId,
        lang,
        turn,
        baseUrl,
      });
      return xmlResponse(res, xml);
    }

    // No clear input — give them one more chance, then bow out.
    const talkAction = `${baseUrl}/api/voice/trinity-talk?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&turn=${turn}`;
    return xmlResponse(res, twiml(
      `<Gather input="speech dtmf" numDigits="1" action="${talkAction}" method="POST" timeout="10" speechTimeout="auto">` +
      say(lang === 'es' ? '¿Hay algo más en lo que pueda ayudarle?' : 'Anything else I can help with?', voiceId, langCode) +
      `</Gather>` +
      say(lang === 'es' ? 'Gracias por llamar. Adiós.' : 'Thank you for calling. Goodbye.', voiceId, langCode)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] trinity-talk-confirm error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 14. PHASE 21 — SALES CHOICE ─────────────────────────────────────────────
// POST /api/voice/sales-choice — three options after the sales extension:
//   1 = leave voicemail (existing behavior)
//   2 = wait for live sales agent (warm transfer)
//   3 = hear a 90-second Co-League overview, then voicemail

voiceRouter.post('/sales-choice', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { Digits, To } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'sales_choice',
      payload: { digit: Digits, lang },
    }).catch((e: any) => log.warn('[VoiceRoutes] sales-choice audit failed:', e?.message));

    if (Digits === '2') {
      // Live transfer to sales team. We prefer the platform-level
      // PLATFORM_SALES_PHONE env var; as a fallback we accept a per-workspace
      // phone column if the deployment has added one.
      let salesPhone = process.env.PLATFORM_SALES_PHONE || '';
      if (!salesPhone) {
        try {
          const { pool } = await import('../db');
          const r = await pool.query(
            `SELECT phone FROM workspaces WHERE id = $1 LIMIT 1`,
            [workspaceId],
          );
          salesPhone = r.rows[0]?.phone || '';
        } catch (e: any) {
          log.warn('[VoiceRoutes] Workspace sales phone lookup failed:', e?.message);
        }
      }

      if (salesPhone && salesPhone.length >= 10) {
        const { handleTransfer } = await import('../services/trinityVoice/extensions/transferExtension');
        return xmlResponse(res, handleTransfer({
          callSid: req.body.CallSid,
          sessionId,
          workspaceId,
          lang,
          transferTo: salesPhone,
          reason: 'sales_live_request',
        }));
      }

      // No sales phone configured — fall through to voicemail with apology.
      const apology = lang === 'es'
        ? 'No hay agentes de ventas disponibles en este momento. Por favor deje un mensaje y le devolveremos la llamada.'
        : 'No sales agents are available at this time. Please leave a message and we\'ll call you back.';
      return xmlResponse(res, twiml(
        say(apology, voiceId, langCode) +
        `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=${lang}" maxLength="120" playBeep="true" />` +
        say(lang === 'es' ? 'Gracias.' : 'Thank you.', voiceId, langCode)
      ));
    }

    if (Digits === '3') {
      // 90-second Co-League overview, then offer voicemail.
      const overviewEn =
        'Co-League is an A. I.-powered workforce management platform built specifically for security companies. ' +
        'Trinity — that\'s me — helps you schedule officers, process payroll, track compliance, manage clients, and fill open shifts automatically. ' +
        'We handle Texas P. S. B. licensing compliance, T. C. O. L. E. tracking, and can integrate with QuickBooks. ' +
        'Our platform starts at a fraction of the cost of legacy systems, with no long-term contracts. ' +
        'If you\'d like to schedule a demo or speak with our team, please leave your name and number after the tone.';
      const overviewEs =
        'Co-League es una plataforma de gestión de personal impulsada por inteligencia artificial diseñada específicamente para empresas de seguridad. ' +
        'Trinity, esa soy yo, le ayuda a programar oficiales, procesar nómina, monitorear cumplimiento, gestionar clientes y cubrir turnos abiertos automáticamente. ' +
        'Manejamos cumplimiento de licencias P. S. B. de Texas, seguimiento T. C. O. L. E. y podemos integrarnos con QuickBooks. ' +
        'Nuestra plataforma comienza a una fracción del costo de los sistemas tradicionales, sin contratos a largo plazo. ' +
        'Si desea agendar una demostración o hablar con nuestro equipo, por favor deje su nombre y número después del tono.';

      return xmlResponse(res, twiml(
        say(lang === 'es' ? overviewEs : overviewEn, voiceId, langCode) +
        `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=${lang}" maxLength="120" playBeep="true" />` +
        say(lang === 'es' ? 'Gracias por su interés en Co-League.' : 'Thank you for your interest in Co-League.', voiceId, langCode)
      ));
    }

    // Default (Digits === '1' or anything else) → voicemail.
    const vmPrompt = lang === 'es'
      ? 'Por favor deje su nombre, el mejor número para comunicarnos con usted, y una breve descripción de sus necesidades después del tono. Un miembro de nuestro equipo se comunicará con usted dentro de un día hábil.'
      : 'Please leave your name, the best number to reach you, and a brief description of your needs after the tone. A member of our team will reach out within one business day.';
    return xmlResponse(res, twiml(
      say(vmPrompt, voiceId, langCode) +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=${lang}" maxLength="120" playBeep="true" />` +
      say(lang === 'es' ? 'Gracias. Que tenga un excelente día.' : 'Thank you. Have a great day.', voiceId, langCode)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] sales-choice error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── 15. PHASE 21 — SCHEDULE CALLBACK PERSISTENCE ────────────────────────────
// POST /api/voice/schedule-callback — caller leaves a recorded callback request.
// Persists the request as a support ticket of type 'callback_request' so an
// agent can pick it up from the dashboard.

voiceRouter.post('/schedule-callback', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { RecordingUrl, CallSid, From } = req.body;
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    try {
      const { pool } = await import('../db');
      const ticketNumber = `CBK-${Date.now().toString(36).toUpperCase()}`;
      const description =
        `Callback request received via Trinity Voice.\n` +
        `Caller: ${From || 'unknown'}\n` +
        `Call SID: ${CallSid || 'unknown'}\n` +
        `Voice session: ${sessionId || 'unknown'}\n` +
        `Recording: ${RecordingUrl || 'pending'}`;

      await pool.query(
        `INSERT INTO support_tickets
            (id, workspace_id, ticket_number, type, ticket_type, priority,
             requested_by, subject, description, status,
             session_data, created_at, updated_at)
         VALUES
            (gen_random_uuid(), $1, $2, 'callback_request', 'callback_request', 'normal',
             $3, $4, $5, 'open',
             $6::jsonb, NOW(), NOW())`,
        [
          workspaceId,
          ticketNumber,
          From || 'unknown',
          lang === 'es'
            ? 'Solicitud de llamada de voz'
            : 'Voice Callback Request',
          description,
          JSON.stringify({
            source: 'voice',
            callSid: CallSid,
            voiceSessionId: sessionId,
            recordingUrl: RecordingUrl || null,
            callerNumber: From || null,
            language: lang,
          }),
        ],
      );

      logCallAction({
        callSessionId: sessionId,
        workspaceId,
        action: 'callback_request_created',
        payload: { ticketNumber, recordingUrl: RecordingUrl || null },
        outcome: 'success',
      }).catch((e: any) => log.warn('[VoiceRoutes] callback audit log failed:', e?.message));

      log.info(`[VoiceRoutes] Callback request ${ticketNumber} created for workspace ${workspaceId}`);

      // Best-effort agent notification — awaited per TRINITY.md §B
      // (non-fatal try/catch; failure is warn-logged, not thrown).
      try {
        const { notifyHumanAgents } = await import('../services/trinityVoice/supportCaseService');
        await notifyHumanAgents({
          supportCase: {
            id: ticketNumber,
            workspace_id: workspaceId,
            case_number: ticketNumber,
            issue_summary: description.slice(0, 500),
            status: 'open',
            language: lang,
          } as any,
          workspaceId,
        });
      } catch (notifyErr: any) {
        log.warn('[VoiceRoutes] Callback agent notify failed (non-fatal):', notifyErr?.message);
      }
    } catch (dbErr: any) {
      log.warn('[VoiceRoutes] Callback persistence failed (non-fatal):', dbErr?.message);
    }

    const goodbye = lang === 'es'
      ? 'Su solicitud de llamada ha sido programada. Un miembro del equipo se comunicará con usted pronto. Gracias por llamar a Co-League.'
      : 'Your callback has been scheduled. A team member will reach out to you shortly. Thank you for calling Co-League!';
    return xmlResponse(res, twiml(say(goodbye, voiceId, langCode)));
  } catch (err: any) {
    log.error('[VoiceRoutes] schedule-callback error:', err.message);
    xmlResponse(res, twiml('<Say>Thank you for your callback request. Goodbye.</Say>'));
  }
});

// ─── Employment Verification (Extension 3) ───────────────────────────────────
// Verifier speaks/enters a Co-League employee ID (EMP-{ORGCODE}-{NNNNN}).
// Trinity parses the org code, resolves the workspace entirely within that
// tenant's context (no cross-tenant search), and directs the verifier to
// submit a signed authorization via email. FCRA compliance requires written
// authorization before any employment detail is disclosed.
voiceRouter.post('/verify-employee-id', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { SpeechResult, Digits } = req.body || {};
    const { sessionId, workspaceId } = extractQS(req);
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const voiceId = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    const spoken = (SpeechResult || Digits || '').toString().trim().toUpperCase();
    // Normalize spoken ID: "E M P dash S P S dash 0 0 0 0 1" → "EMP-SPS-00001"
    const normalized = spoken.replace(/\s+/g, '').replace(/DASH/g, '-').replace(/[^A-Z0-9-]/g, '');

    // Validate format: EMP-{ORGCODE}-{SEQUENCE}
    const empIdMatch = normalized.match(/^EMP-([A-Z0-9]{2,6})-(\d{1,8})$/);
    if (!empIdMatch) {
      const retry = lang === 'es'
        ? `No reconocí ese número. El formato es E-M-P guión, seguido del código de organización, guión, y el número de empleado. Por ejemplo, E-M-P guión S-P-S guión 0-0-0-0-1. Por favor intente de nuevo o envíe su solicitud por escrito.`
        : `I didn't recognize that format. Employee IDs begin with EMP dash, followed by the org code, dash, and employee number. For example, EMP dash SPS dash 00001. Please try again or submit a written request.`;

      return xmlResponse(res, twiml(
        say(retry, voiceId, langCode) +
        redirect(`${baseUrl}/api/voice/general-menu?lang=${lang}`)
      ));
    }

    const empId = normalized;
    const orgCode = empIdMatch[1];

    // Look up workspace by org code — WITHIN THAT TENANT ONLY.
    // Direct pool query keeps the lookup scoped to a single row filtered by
    // org_code (no cross-tenant enumeration).
    const { pool } = await import('../db');
    const wsResult = await pool.query(
      `SELECT id, name, company_name, org_code, email_slug
         FROM workspaces
        WHERE UPPER(org_code) = $1
          AND subscription_status IN ('active','free_trial','trial')
        LIMIT 1`,
      [orgCode]
    );

    if (!wsResult.rows.length) {
      const notFound = lang === 'es'
        ? `No encontré una organización con el código ${orgCode}. Verifique el número de empleado o comuníquese directamente con el empleador.`
        : `I couldn't find an organization with code ${orgCode}. Please verify the employee ID number or contact the employer directly.`;
      return xmlResponse(res, twiml(say(notFound, voiceId, langCode)));
    }

    const tenantWs = wsResult.rows[0];
    const orgSlug = (tenantWs.email_slug || tenantWs.org_code || orgCode).toString().toLowerCase();
    const companyName = tenantWs.company_name || tenantWs.name;

    // Log the verification request (FCRA audit requirement)
    logCallAction({
      callSessionId: sessionId,
      workspaceId: tenantWs.id,
      action: 'employment_verification_requested',
      payload: { employeeId: empId, requestedBySession: sessionId, orgCode },
      outcome: 'success',
    }).catch((e: any) => log.warn('[VoiceRoutes] verify audit log failed:', e?.message));

    // Direct verifier to email channel — legal best practice. Trinity will not
    // disclose any details over the phone without a signed authorization on
    // file; the email pipeline handles authorization parsing and management
    // approval. Phase 29 polish: spell the email address letter-by-letter
    // so the caller can copy it down on the first pass, and offer an SMS
    // fallback that texts the caller a signed intake link.
    const referenceNumber = (sessionId || '').slice(-6) || Date.now().toString(36).slice(-6).toUpperCase();
    const verifyEmail = `verify@${orgSlug}.coaileague.com`;

    // Spell the email so Polly doesn't read it as a word.
    // "verify@sps.coaileague.com" → "V E R I F Y at S P S dot coaileague dot com"
    const spelledEmail = spellEmailForTTS(verifyEmail, lang);

    const instructions = lang === 'es'
      ? `Encontré al empleado en ${companyName}. Por ley, las verificaciones de empleo requieren autorización escrita del empleado. ` +
        `Su número de referencia es ${(referenceNumber || '').split('').join(' ')}. ` +
        `Puedo enviarle un enlace por mensaje de texto para completar la solicitud, o puede enviar por correo electrónico. ` +
        `Marque 1 para recibir el enlace por texto. Marque 2 para escuchar la dirección de correo electrónico deletreada.`
      : `I found the employee at ${companyName}. By law, employment verifications require written authorization from the employee. ` +
        `Your reference number is ${(referenceNumber || '').split('').join(' ')}. ` +
        `I can text you a secure link to complete the request, or you can submit by email. ` +
        `Press 1 to receive the link by text. Press 2 to hear the email address spelled out.`;

    const action = `${baseUrl}/api/voice/verify-employee-id-channel?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(tenantWs.id)}&lang=${lang}&orgSlug=${encodeURIComponent(orgSlug)}&empId=${encodeURIComponent(empId)}&ref=${encodeURIComponent(referenceNumber)}`;

    return xmlResponse(res, twiml(
      `<Gather input="dtmf" action="${action}" method="POST" numDigits="1" timeout="12">` +
      say(instructions, voiceId, langCode) +
      `</Gather>` +
      // No selection fallback — default to speaking the spelled email
      say(
        lang === 'es'
          ? `Muy bien, la dirección de correo electrónico es: ${spelledEmail}. Repito: ${spelledEmail}. Le responderemos dentro de dos días hábiles. Gracias.`
          : `Very well, the email address is: ${spelledEmail}. I'll repeat: ${spelledEmail}. We will respond within two business days. Thank you.`,
        voiceId, langCode
      )
    ));

  } catch (err: any) {
    log.error('[VoiceRoutes] verify-employee-id error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Please call back or submit your request in writing.</Say>'));
  }
});

// ─── Helper: extract QS params set during the call flow ──────────────────────

function extractQS(req: Request): { sessionId: string; workspaceId: string } {
  const sessionId = (req.query.sessionId as string) || (req.body.sessionId as string) || '';
  const workspaceId = (req.query.workspaceId as string) || (req.body.workspaceId as string) || '';
  return { sessionId, workspaceId };
}

// Phase 29 — spell an email address for TTS. Converts "verify@sps.coaileague.com"
// to "V E R I F Y at S P S dot coaileague dot com". The domain portion is
// only spelled if it's short; well-known brand strings ("coaileague") are
// left intact because Polly pronounces them acceptably.
function spellEmailForTTS(email: string, lang: 'en' | 'es' = 'en'): string {
  const [local, domain] = (email || '').split('@');
  if (!local || !domain) return email;
  const atWord = lang === 'es' ? 'arroba' : 'at';
  const dotWord = lang === 'es' ? 'punto' : 'dot';
  const spell = (s: string) => s.toUpperCase().split('').join(' ');
  const parts = domain.split('.');
  const domSpoken = parts.map(p => p.length <= 4 ? spell(p) : p).join(` ${dotWord} `);
  return `${spell(local)} ${atWord} ${domSpoken}`;
}

// ─── EMPLOYMENT-VERIFY CHANNEL CHOICE (Phase 29) ──────────────────────────────
// After /verify-employee-id identifies the tenant, the caller picks how they
// want to receive the verification intake link: SMS (digit 1) or email
// (digit 2, also the silent-fallback default).
voiceRouter.post('/verify-employee-id-channel', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const { sessionId } = extractQS(req);
    const workspaceId = (req.query.workspaceId as string) || '';
    const orgSlug = (req.query.orgSlug as string) || '';
    const empId = (req.query.empId as string) || '';
    const ref = (req.query.ref as string) || '';
    const Digits = (req.body.Digits as string) || '';
    const callerPhone = (req.body.From as string) || '';
    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    const verifyEmail = `verify@${orgSlug}.coaileague.com`;
    const spelled = spellEmailForTTS(verifyEmail, lang);

    if (Digits === '1') {
      // SMS the intake link
      let sent = false;
      if (callerPhone && callerPhone.length >= 10) {
        try {
          const { sendSMS } = await import('../services/smsService');
          const url = `${baseUrl}/verify/employment?emp=${encodeURIComponent(empId)}&ref=${encodeURIComponent(ref)}`;
          await sendSMS({
            to: callerPhone,
            body: (lang === 'es'
              ? `CoAIleague — Verificación de empleo. Ref ${ref}. Complete la autorización: ${url}`
              : `CoAIleague — Employment verification. Ref ${ref}. Complete authorization: ${url}`).slice(0, 280),
            workspaceId,
            type: 'verify_employment_link',
          } as any);
          sent = true;
        } catch (err: any) {
          log.warn('[VoiceRoutes] /verify-employee-id-channel SMS failed:', err?.message);
        }
      }

      const msg = sent
        ? (lang === 'es'
            ? `Envié un enlace seguro al número que está llamando. Su número de referencia es ${(ref || '').split('').join(' ')}. Gracias.`
            : `I sent a secure link to the number you're calling from. Your reference number is ${(ref || '').split('').join(' ')}. Thank you.`)
        : (lang === 'es'
            ? `No pude enviar el mensaje a este número. La dirección de correo electrónico es: ${spelled}. Repito: ${spelled}.`
            : `I couldn't send a text to this number. The email address is: ${spelled}. I'll repeat: ${spelled}.`);
      return xmlResponse(res, twiml(say(msg, voice, langCode)));
    }

    // Default / Digit 2 → speak the spelled email, twice, slowly
    const msg = lang === 'es'
      ? `La dirección de correo electrónico es: ${spelled}. Repito: ${spelled}. Le responderemos dentro de dos días hábiles. Su número de referencia es ${(ref || '').split('').join(' ')}. Gracias.`
      : `The email address is: ${spelled}. I'll repeat: ${spelled}. We will respond within two business days. Your reference number is ${(ref || '').split('').join(' ')}. Thank you.`;
    return xmlResponse(res, twiml(say(msg, voice, langCode)));
  } catch (err: any) {
    log.error('[VoiceRoutes] /verify-employee-id-channel error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── MANAGEMENT API ───────────────────────────────────────────────────────────
// All management routes require authentication and a professional+ plan.
// Using a sub-router with router.use() avoids per-route `as any` casts.

const mgmtRouter = Router();
mgmtRouter.use(requireAuth);
// Voice requires Professional+. Return 402 (Payment Required) to match Phase 56 spec.
mgmtRouter.use(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { cacheManager } = await import('../services/platform/cacheManager');
    const tierInfo = await cacheManager.getWorkspaceTierWithStatus(req.workspaceId!);
    const tierHierarchy: Record<string, number> = {
      free: 0, starter: 1, professional: 2, business: 3, enterprise: 4, strategic: 5,
    };
    const currentTier = (tierInfo?.tier as string) || 'free';
    const currentLevel = tierHierarchy[currentTier] ?? 0;
    const requiredLevel = tierHierarchy['professional'] ?? 2;
    if (currentLevel < requiredLevel) {
      return res.status(402).json({
        error: 'PAYMENT_REQUIRED',
        code: 'TIER_UPGRADE_REQUIRED',
        currentTier,
        requiredTier: 'professional',
        message: 'Trinity Voice Phone System requires the Professional plan or higher.',
        upgradeUrl: '/billing/upgrade',
      });
    }
    next();
  } catch (err: any) {
    log.error('[VoiceMgmt] Tier check error — failing closed:', err.message);
    return res.status(402).json({
      error: 'PAYMENT_REQUIRED',
      code: 'TIER_CHECK_FAILED',
      message: 'Unable to verify plan tier. Please try again or contact support.',
    });
  }
});

// GET /api/voice/numbers — list phone numbers for workspace
mgmtRouter.get('/numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const numbers = await db.select()
      .from(workspacePhoneNumbers)
      .where(eq(workspacePhoneNumbers.workspaceId, workspaceId))
      .orderBy(desc(workspacePhoneNumbers.createdAt));
    res.json({ numbers });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/voice/numbers/:id — update extension config and persona script for a phone number
mgmtRouter.patch('/numbers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { extensionConfig, greetingScript, greetingScriptEs, isActive } = req.body;

    const [existing] = await db.select()
      .from(workspacePhoneNumbers)
      .where(and(
        eq(workspacePhoneNumbers.id, id),
        eq(workspacePhoneNumbers.workspaceId, workspaceId),
      ));
    if (!existing) return res.status(404).json({ error: 'Phone number not found' });

    const updateData: Partial<typeof workspacePhoneNumbers.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (extensionConfig !== undefined) updateData.extensionConfig = extensionConfig;
    if (greetingScript !== undefined) updateData.greetingScript = greetingScript;
    if (greetingScriptEs !== undefined) updateData.greetingScriptEs = greetingScriptEs;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db.update(workspacePhoneNumbers)
      .set(updateData)
      .where(and(
        eq(workspacePhoneNumbers.id, id),
        eq(workspacePhoneNumbers.workspaceId, workspaceId),
      ))
      .returning();

    res.json({ number: updated });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/voice/calls — call history for workspace
mgmtRouter.get('/calls', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const limit = Math.min(parseInt(req.query.limit as string || '50'), 200);
    const offset = parseInt(req.query.offset as string || '0');

    const calls = await db.select()
      .from(voiceCallSessions)
      .where(eq(voiceCallSessions.workspaceId, workspaceId))
      .orderBy(desc(voiceCallSessions.startedAt))
      .limit(limit)
      .offset(offset);

    res.json({ calls, total: calls.length });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/voice/calls/:id/transcript
mgmtRouter.get('/calls/:id/transcript', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;

    const [session] = await db.select()
      .from(voiceCallSessions)
      .where(and(
        eq(voiceCallSessions.id, id),
        eq(voiceCallSessions.workspaceId, workspaceId),
      ))
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Call not found' });
    res.json({ transcript: session.transcript, recordingUrl: session.recordingUrl, session });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── SUPPORT CASE MANAGEMENT API ─────────────────────────────────────────────

// GET /api/voice/support/cases — list all support cases
mgmtRouter.get('/support/cases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const status = req.query.status as string;
    const cases = status === 'open'
      ? await listOpenCases(workspaceId, 100)
      : await listAllCases(workspaceId, 200);
    res.json({ cases, total: cases.length });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/voice/support/cases/:caseNumber — get case details
mgmtRouter.get('/support/cases/:caseNumber', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const { caseNumber } = req.params;
    const supportCase = await findCaseByNumber(caseNumber, workspaceId);
    if (!supportCase) return res.status(404).json({ error: 'Case not found' });
    res.json({ case: supportCase });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/voice/support/cases/:caseNumber/resolve — resolve a case
mgmtRouter.post('/support/cases/:caseNumber/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const { caseNumber } = req.params;
    const { resolutionNotes } = req.body;
    const resolvedBy = (req as any).user?.email || (req as any).user?.id || 'manager';

    const resolved = await resolveSupportCase({
      caseNumber,
      workspaceId,
      resolvedBy,
      resolutionNotes,
    });

    if (!resolved) return res.status(404).json({ error: 'Case not found or already resolved' });
    res.json({ success: true, case: resolved });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/voice/support/agents — list support agents
mgmtRouter.get('/support/agents', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const agents = await getAllAgents(workspaceId);
    res.json({ agents, total: agents.length });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/voice/support/agents — add or update a support agent
mgmtRouter.post('/support/agents', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const { name, email, phone, role, notificationChannels } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });

    const agent = await upsertAgent({
      workspaceId, name, email, phone,
      role: role || 'support_agent',
      notificationChannels: notificationChannels || ['email'],
    });
    res.json({ success: true, agent });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/voice/support/agents/:id — deactivate a support agent
mgmtRouter.delete('/support/agents/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    await deactivateAgent(id, workspaceId);
    res.json({ success: true });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/voice/analytics — usage stats
mgmtRouter.get('/analytics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId!;

    const calls = await db.select()
      .from(voiceCallSessions)
      .where(eq(voiceCallSessions.workspaceId, workspaceId))
      .orderBy(desc(voiceCallSessions.startedAt))
      .limit(500);

    const totalCalls = calls.length;
    const completedCalls = calls.filter(c => c.status === 'completed').length;
    const totalDurationSec = calls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
    const avgDurationSec = completedCalls > 0 ? Math.round(totalDurationSec / completedCalls) : 0;
    const totalSpentCents = calls.reduce((sum, c) => sum + (c.actualCostCents || 0), 0);

    const byExtension = calls.reduce((acc, c) => {
      const ext = c.extensionLabel || 'unknown';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      totalCalls,
      completedCalls,
      avgDurationSec,
      totalSpentCents,
      byExtension,
    });
  } catch (err: any) {
    log.error('[Route] Internal error:', err);
        res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── CLIENT-VS-GUEST BRANCHING (Phase 27) ─────────────────────────────────────
// When a caller hits Ext-2 (client support) without a pre-resolved client
// context, clientExtension now asks them "are you a current client of a
// provider, or a guest with general questions?" and POSTs to this endpoint.
// Digit 1 / speech("client","current") → provider lookup flow
// Digit 2 / speech("guest","no provider") → guest-intake (limited) flow
voiceRouter.post('/client-or-guest', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const Digits = (req.body.Digits as string) || '';
    const Speech = ((req.body.SpeechResult as string) || '').toLowerCase();

    const looksLikeClient = Digits === '1'
      || /\b(client|current|receiving|receive services|customer|provider|contract|yes)\b/i.test(Speech)
      || /\b(cliente|actual|recibiendo|proveedor|contrato|s[ií])\b/i.test(Speech);
    const looksLikeGuest = Digits === '2'
      || /\b(guest|no provider|question|complaint|i don.?t|no)\b/i.test(Speech)
      || /\b(invitado|visitante|no tengo|queja|pregunta)\b/i.test(Speech);

    if (looksLikeClient) {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/client-provider-lookup?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }
    if (looksLikeGuest) {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/guest-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    // Neither matched — treat as guest by default (less token spend than client lookup)
    const fallbackMsg = lang === 'es'
      ? 'No entendí su respuesta. Lo tomaré como consulta general.'
      : "I didn't catch that. I'll treat this as a general inquiry.";
    return xmlResponse(res, twiml(
      say(fallbackMsg, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
      redirect(`${baseUrl}/api/voice/guest-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /client-or-guest error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── CLIENT PROVIDER LOOKUP (Phase 27 + Phase 28) ─────────────────────────────
// Asks for the provider's client code (CLT-XXX-NNNNN), company name, OR state
// license number (e.g. C11608501 for Texas PSB). Fuzzy-matches against
// `clients` by external_id / client_number, then `workspaces` by license
// number, then by name. Also plays a "Searching for provider, stand by..."
// confirmation before the DB lookup so the caller knows Trinity is working.
// When matched the flow redirects into the tenant-branded provider menu
// at /provider-branded-menu — NOT the generic CoAIleague support flow.
voiceRouter.post('/client-provider-lookup', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const Speech = ((req.body.SpeechResult as string) || '').trim();
    const Digits = (req.body.Digits as string) || '';
    const attempt = parseInt((req.query.attempt as string) || '1', 10);

    // First call — prompt for code, company name, or license number
    if (!Speech && !Digits) {
      const prompt = lang === 'es'
        ? 'Por favor diga el nombre de la empresa que le proporciona servicios, su número de licencia estatal, o su código de cliente que comienza con C L T.'
        : "Please say the name of the company providing your services, the state license number, or your client code beginning with C L T.";
      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${baseUrl}/api/voice/client-provider-lookup?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&attempt=1" method="POST" timeout="12" speechTimeout="auto" hints="CLT,Statewide,Protective,Services,license,company,provider,security">` +
        say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `</Gather>` +
        redirect(`${baseUrl}/api/voice/guest-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    // Acknowledge the caller so they know we're looking them up
    const standByMsg = lang === 'es'
      ? 'Un momento, estoy buscando el proveedor.'
      : "One moment — I'm searching for your provider.";

    // Try to resolve in this priority order:
    //  1. CLT-XXX-NNNNN  → clients row
    //  2. State license  → workspaces row (e.g. Texas PSB "C11608501")
    //  3. Company name   → workspaces fuzzy
    const raw = (Speech || Digits).trim();
    const rawUpper = raw.toUpperCase();
    let matched: {
      workspaceId: string;
      clientId?: string;
      label: string;
      licenseNumber?: string | null;
      licenseState?: string | null;
    } | null = null;

    try {
      const { pool } = await import('../db');

      // 1. CLT code pattern
      const cltPattern = rawUpper.replace(/[^A-Z0-9\-]/g, '').match(/CLT-?[A-Z0-9]{2,8}-?\d{1,6}/);
      if (cltPattern) {
        const r = await pool.query(
          `SELECT c.id AS client_id, c.workspace_id, w.name AS ws_name,
                  w.state_license_number, w.state_license_state
             FROM clients c
             LEFT JOIN workspaces w ON w.id = c.workspace_id
            WHERE UPPER(COALESCE(c.client_number, c.external_id, '')) = $1
               OR UPPER(COALESCE(c.external_id, '')) = $1
            LIMIT 1`,
          [cltPattern[0]],
        );
        if (r.rows.length) {
          matched = {
            workspaceId: r.rows[0].workspace_id,
            clientId: r.rows[0].client_id,
            label: r.rows[0].ws_name || cltPattern[0],
            licenseNumber: r.rows[0].state_license_number,
            licenseState: r.rows[0].state_license_state,
          };
        }
      }

      // 2. State license number pattern — e.g. "C11608501" (letter + 7-9 digits)
      if (!matched) {
        const licensePattern = rawUpper.replace(/[^A-Z0-9]/g, '').match(/[A-Z]\d{7,9}/);
        if (licensePattern) {
          const r = await pool.query(
            `SELECT id, name, state_license_number, state_license_state
               FROM workspaces
              WHERE UPPER(REGEXP_REPLACE(COALESCE(state_license_number, ''), '[^A-Z0-9]', '', 'g')) = $1
                AND COALESCE(subscription_status, 'active') != 'cancelled'
              LIMIT 1`,
            [licensePattern[0]],
          );
          if (r.rows.length) {
            matched = {
              workspaceId: r.rows[0].id,
              label: r.rows[0].name,
              licenseNumber: r.rows[0].state_license_number,
              licenseState: r.rows[0].state_license_state,
            };
          }
        }
      }

      // 3. Company name fuzzy
      if (!matched) {
        const cleaned = raw.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 80);
        if (cleaned.length >= 3) {
          const r = await pool.query(
            `SELECT id, name, state_license_number, state_license_state
               FROM workspaces
              WHERE LOWER(name) LIKE LOWER($1)
                AND COALESCE(subscription_status, 'active') != 'cancelled'
              LIMIT 1`,
            [`%${cleaned}%`],
          );
          if (r.rows.length) {
            matched = {
              workspaceId: r.rows[0].id,
              label: r.rows[0].name,
              licenseNumber: r.rows[0].state_license_number,
              licenseState: r.rows[0].state_license_state,
            };
          }
        }
      }
    } catch (lookupErr: any) {
      log.warn('[VoiceRoutes] /client-provider-lookup DB error:', lookupErr?.message);
    }

    if (matched) {
      // Persist providerWorkspaceId + clientId + license on the call session
      // so downstream prompts and the branded menu can enrich their context.
      try {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                             jsonb_build_object(
                               'client_provider_workspace_id', $1::text,
                               'client_id', $2::text,
                               'provider_name', $3::text,
                               'provider_license', $4::text,
                               'provider_license_state', $5::text
                             )
            WHERE twilio_call_sid = $6`,
          [
            matched.workspaceId,
            matched.clientId || null,
            matched.label,
            matched.licenseNumber || null,
            matched.licenseState || null,
            req.body.CallSid || sessionId,
          ],
        );
      } catch { /* non-fatal */ }

      // Route into the tenant-branded menu, NOT the generic CoAIleague support.
      const qs = `sessionId=${encodeURIComponent(sessionId)}` +
                 `&workspaceId=${encodeURIComponent(matched.workspaceId)}` +
                 `&lang=${lang}`;
      return xmlResponse(res, twiml(
        say(standByMsg, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        redirect(`${baseUrl}/api/voice/provider-branded-menu?${qs}`)
      ));
    }

    // No match — offer one retry, then fall through to guest intake
    if (attempt < 2) {
      const retryMsg = lang === 'es'
        ? 'No encontré ese proveedor. Intentemos de nuevo: diga el nombre de la empresa, el número de licencia estatal, o el código de cliente.'
        : "I didn't find that provider. Let's try once more — say the company name, the state license number, or the client code.";
      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${baseUrl}/api/voice/client-provider-lookup?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&attempt=${attempt + 1}" method="POST" timeout="12" speechTimeout="auto">` +
        say(retryMsg, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `</Gather>` +
        redirect(`${baseUrl}/api/voice/guest-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    // After two misses fall back to guest intake — protects AI-token budget
    const fallMsg = lang === 'es'
      ? 'No pude encontrar al proveedor. Continuaré con usted como invitado.'
      : "I couldn't locate the provider. I'll continue with you as a guest.";
    return xmlResponse(res, twiml(
      say(fallMsg, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
      redirect(`${baseUrl}/api/voice/guest-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /client-provider-lookup error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── GUEST INTAKE (Phase 27) ──────────────────────────────────────────────────
// For callers without a provider account. Token-conservative: offers three
// concrete branches (file a complaint / ask a quick question / leave a message)
// rather than handing to free-form AI. Each branch has a bounded next step.
voiceRouter.post('/guest-intake', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const Digits = (req.body.Digits as string) || '';
    const Speech = ((req.body.SpeechResult as string) || '').toLowerCase();

    // If we have a choice, route
    const isComplaint = Digits === '1' || /\b(complaint|officer|file|report)\b/.test(Speech) || /\b(queja|oficial|reportar)\b/.test(Speech);
    const isQuestion = Digits === '2' || /\b(question|info|help)\b/.test(Speech) || /\b(pregunta|informaci[oó]n|ayuda)\b/.test(Speech);
    const isMessage = Digits === '3' || /\b(message|leave|callback)\b/.test(Speech) || /\b(mensaje|dejar|llamar)\b/.test(Speech);
    const isVerification = Digits === '4' ||
      /\b(verif|employment|work|hire|hired|work\s*there|still\s*work)\b/.test(Speech) ||
      /\b(verific|empleo|trabaja|contrat)\b/.test(Speech);

    if (isComplaint) {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/guest-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }
    if (isQuestion) {
      // One bounded AI turn via existing support-resolve, marked guest
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/support-resolve?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&guest=1`)
      ));
    }
    if (isMessage) {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/schedule-callback?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }
    if (isVerification) {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/guest-employment-verify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    // First call — present the 4-choice menu
    const prompt = lang === 'es'
      ? 'Entendido. Tengo cuatro opciones. Marque 1 para presentar una queja. Marque 2 para una pregunta general. Marque 3 para dejar un mensaje. Marque 4 para verificar empleo.'
      : "Got it. Four options. Press 1 to file a complaint. Press 2 for a general question. Press 3 to leave a message for a human. Press 4 to verify someone's employment.";
    return xmlResponse(res, twiml(
      `<Gather input="speech dtmf" action="${baseUrl}/api/voice/guest-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}" method="POST" numDigits="1" timeout="10" speechTimeout="auto" hints="complaint,officer,question,message,leave,verify,employment,work">` +
      say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
      `</Gather>` +
      say(lang === 'es' ? 'No recibí ninguna selección. Adiós.' : "I did not receive a selection. Goodbye.", lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US')
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /guest-intake error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── GUEST COMPLAINT INTAKE (Phase 27) ────────────────────────────────────────
// No attribution required. Two short prompts (company name → officer name) so
// the complaint has context. Then `<Record>` captures the caller's own words
// verbatim. Twilio's transcription callback posts to /transcription-done with
// a `caseType=guest_complaint` param which the downstream handler recognises
// and persists into support_tickets (workspace = platform support) for human
// triage.
voiceRouter.post('/guest-complaint-intake', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const step = (req.query.step as string) || 'company';
    const Speech = ((req.body.SpeechResult as string) || '').trim();

    // Step 1: ask company name
    if (step === 'company' && !Speech) {
      const prompt = lang === 'es'
        ? 'Lamento escuchar esto. Para ayudarle, primero dígame el nombre de la empresa de seguridad involucrada.'
        : "I'm sorry to hear that. To help, first please tell me the name of the security company involved.";
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${baseUrl}/api/voice/guest-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=officer" method="POST" timeout="10" speechTimeout="auto">` +
        say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `</Gather>` +
        say(lang === 'es' ? 'No recibí el nombre. Adiós.' : "I didn't catch the name. Goodbye.", lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US')
      ));
    }

    // Step 2: persist the company name and ask for officer name (optional)
    if (step === 'officer') {
      try {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                             jsonb_build_object('complaint_company', $1::text)
            WHERE twilio_call_sid = $2`,
          [Speech.slice(0, 200), req.body.CallSid || sessionId],
        );
      } catch { /* non-fatal */ }

      const prompt = lang === 'es'
        ? 'Gracias. Si conoce el nombre del oficial, dígalo ahora. De lo contrario, solo diga "no lo sé".'
        : "Thank you. If you know the officer's name, please say it now. Otherwise, just say \"I don't know\".";
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${baseUrl}/api/voice/guest-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=record" method="POST" timeout="8" speechTimeout="auto">` +
        say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `</Gather>` +
        // If no speech, still go to the record step (officer name is optional)
        redirect(`${baseUrl}/api/voice/guest-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=record`)
      ));
    }

    // Step 3: persist the officer name and <Record> the complaint verbatim
    if (step === 'record') {
      if (Speech) {
        try {
          const { pool } = await import('../db');
          await pool.query(
            `UPDATE voice_call_sessions
                SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                               jsonb_build_object('complaint_officer', $1::text)
              WHERE twilio_call_sid = $2`,
            [Speech.slice(0, 200), req.body.CallSid || sessionId],
          );
        } catch { /* non-fatal */ }
      }

      const prompt = lang === 'es'
        ? 'Gracias. Ahora por favor explique lo ocurrido con sus propias palabras. Escuchamos completamente. Cuando termine, presione cualquier tecla o simplemente deje de hablar.'
        : "Thank you. Now please explain in your own words what happened. We are listening in full. When you're finished, press any key or just stop speaking.";
      return xmlResponse(res, twiml(
        say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `<Record ` +
          `action="${baseUrl}/api/voice/recording-done?caseType=guest_complaint&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}" ` +
          `method="POST" ` +
          `maxLength="180" ` +
          `timeout="3" ` +
          `finishOnKey="*#0123456789" ` +
          `transcribe="true" ` +
          `transcribeCallback="${baseUrl}/api/voice/transcription-done?caseType=guest_complaint&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}" ` +
          `playBeep="true"` +
        `/>`
      ));
    }

    // Unknown step — redirect back to start
    return xmlResponse(res, twiml(
      redirect(`${baseUrl}/api/voice/guest-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=company`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /guest-complaint-intake error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── GUEST EMPLOYMENT VERIFICATION (Voice) ────────────────────────────────────
// Caller states who they are, who they're verifying, their purpose.
// Creates an employment_verification support ticket; manager approves/denies via
// existing /api/employment-verify/approve|deny. Session bills 500-token cap.
voiceRouter.post('/guest-employment-verify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const step = (req.query.step as string) || 'intro';
    const Speech = ((req.body.SpeechResult as string) || '').trim();

    if (step === 'intro' && !Speech) {
      const prompt = lang === 'es'
        ? 'Para verificar el empleo, necesito su nombre, organización y el propósito de esta verificación. Por favor hable ahora.'
        : "To verify employment, I need your name, organization, and the purpose of this verification. Please speak now.";
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${baseUrl}/api/voice/guest-employment-verify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=employee" method="POST" timeout="15" speechTimeout="auto">` +
        say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `</Gather>` +
        say(lang === 'es' ? 'No recibí respuesta. Adiós.' : "I didn't catch that. Goodbye.",
          lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US')
      ));
    }

    if (step === 'employee') {
      try {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                             jsonb_build_object('verify_requester', $1::text, 'guest_type', 'employment_verification')
            WHERE twilio_call_sid = $2`,
          [Speech.slice(0, 300), req.body.CallSid || sessionId]
        ).catch(() => null);
      } catch { /* non-fatal */ }

      const prompt = lang === 'es'
        ? 'Gracias. Ahora diga el nombre completo de la persona cuyo empleo desea verificar.'
        : "Thank you. Now please say the full name of the person whose employment you'd like to verify.";
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${baseUrl}/api/voice/guest-employment-verify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=submit" method="POST" timeout="10" speechTimeout="auto">` +
        say(prompt, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `</Gather>` +
        say(lang === 'es' ? 'No recibí el nombre. Adiós.' : "I didn't catch the name. Goodbye.",
          lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US')
      ));
    }

    if (step === 'submit' && Speech) {
      try {
        const { pool } = await import('../db');
        const sessionRow = await pool.query(
          `SELECT metadata FROM voice_call_sessions WHERE twilio_call_sid = $1 LIMIT 1`,
          [req.body.CallSid || sessionId]
        ).catch(() => ({ rows: [] as any[] }));
        const requesterInfo = sessionRow.rows[0]?.metadata?.verify_requester || 'Unknown caller';
        const refNum = `VER-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        await pool.query(`
          INSERT INTO support_tickets
            (id, workspace_id, ticket_number, type, subject, description,
             status, priority, source, created_at, updated_at)
          VALUES
            (gen_random_uuid(), $1, $2, 'employment_verification',
             'Voice Employment Verification Request',
             $3::text,
             'open', 'normal', 'voice', NOW(), NOW())
        `, [
          workspaceId || PLATFORM_WORKSPACE_ID,
          refNum,
          JSON.stringify({
            requester: { requester_name: requesterInfo, purpose: 'Employment verification via voice' },
            employeeNameSpoken: Speech.slice(0, 200),
            channel: 'voice',
            callSid: req.body.CallSid || sessionId,
          })
        ]).catch((e: any) => log.warn('[VoiceVerify] Ticket insert failed:', e?.message));

        // Record guest session token usage (500 cap for verification)
        const { recordGuestSessionUsage } = await import('../services/billing/guestSessionService');
        await recordGuestSessionUsage({
          workspaceId: workspaceId || PLATFORM_WORKSPACE_ID,
          sessionId,
          guestType: 'employment_verification',
          channel: 'voice',
          tokensUsed: 500,
        }).catch((e: any) => log.warn('[VoiceVerify] session usage record failed:', e?.message));

      } catch (err: any) {
        log.warn('[VoiceVerify] Submit path failed:', err?.message);
      }

      const confirmMsg = lang === 'es'
        ? `Su solicitud de verificación ha sido enviada. El empleador revisará su solicitud y responderá por correo electrónico. Gracias. Adiós.`
        : `Your verification request has been submitted. The employer will review and respond by email. Thank you. Goodbye.`;
      return xmlResponse(res, twiml(
        say(confirmMsg, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        `<Hangup />`
      ));
    }

    return xmlResponse(res, twiml(
      redirect(`${baseUrl}/api/voice/guest-employment-verify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=intro`)
    ));

  } catch (err: any) {
    log.error('[VoiceRoutes] /guest-employment-verify error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── PROVIDER-BRANDED MENU (Phase 28) ─────────────────────────────────────────
// Once /client-provider-lookup resolves the caller to a specific tenant
// workspace, Trinity switches into the provider's brand: greets with the
// tenant's name + state license number and presents a tenant-scoped options
// menu. Every downstream action runs against THAT workspace, not CoAIleague.
voiceRouter.post('/provider-branded-menu', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const callSid = (req.body.CallSid as string) || sessionId;

    // Hydrate provider name + license from session metadata (set by /client-provider-lookup),
    // falling back to a live workspaces lookup if missing.
    let providerName = '';
    let licenseNumber = '';
    let licenseState = '';
    try {
      const { pool } = await import('../db');
      const r = await pool.query(
        `SELECT metadata FROM voice_call_sessions WHERE twilio_call_sid = $1 LIMIT 1`,
        [callSid],
      );
      const meta = (r.rows[0]?.metadata as Record<string, any> | null) || {};
      providerName = meta.provider_name || '';
      licenseNumber = meta.provider_license || '';
      licenseState = meta.provider_license_state || '';
      if (!providerName && workspaceId) {
        const w = await pool.query(
          `SELECT name, state_license_number, state_license_state FROM workspaces WHERE id = $1 LIMIT 1`,
          [workspaceId],
        );
        if (w.rows.length) {
          providerName = w.rows[0].name;
          licenseNumber = w.rows[0].state_license_number || '';
          licenseState = w.rows[0].state_license_state || '';
        }
      }
    } catch { /* non-fatal */ }

    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';
    const displayName = providerName || (lang === 'es' ? 'su proveedor' : 'your provider');
    const licenseLine = licenseNumber
      ? (lang === 'es'
          ? `, licencia número ${spellLicense(licenseNumber)}`
          : `, license number ${spellLicense(licenseNumber)}`)
      : '';
    const stateSuffix = licenseNumber && licenseState
      ? (lang === 'es' ? ` del estado de ${licenseState}` : ` in the state of ${licenseState}`)
      : '';

    const greeting = lang === 'es'
      ? `¡Los encontré! Gracias por llamar a ${displayName}${licenseLine}${stateSuffix}. Por favor escuche las siguientes opciones.`
      : `I found them! Thank you for calling ${displayName}${licenseLine}${stateSuffix}. Please listen to the following options.`;

    const menuEn = [
      'Press 1 to report an incident at your site or request immediate officer dispatch.',
      'Press 2 to request additional coverage or add a shift.',
      'Press 3 for billing, invoices, or payment questions.',
      'Press 4 to file a complaint or report a concern about an officer or service.',
      'Press 5 to update your scheduled services.',
      'Press 6 to speak with the supervisor on duty.',
      'Press 7 to leave a message for your account manager.',
      'Press 0 to speak with me, Trinity, about anything else.',
      'Press 9 to switch to Spanish.',
    ].join(' ');
    const menuEs = [
      'Marque 1 para reportar un incidente en su sitio o solicitar despacho inmediato de un oficial.',
      'Marque 2 para solicitar cobertura adicional o agregar un turno.',
      'Marque 3 para facturación, facturas o preguntas de pago.',
      'Marque 4 para presentar una queja sobre un oficial o el servicio.',
      'Marque 5 para actualizar sus servicios programados.',
      'Marque 6 para hablar con el supervisor de turno.',
      'Marque 7 para dejar un mensaje a su gerente de cuenta.',
      'Marque 0 para hablar conmigo, Trinity, sobre cualquier otra cosa.',
      'Marque 8 para inglés.',
    ].join(' ');

    const hintsEn = 'incident,dispatch,coverage,shift,invoice,billing,complaint,officer,schedule,supervisor,account,manager,trinity,help';
    const hintsEs = 'incidente,despacho,cobertura,turno,factura,facturación,queja,oficial,horario,supervisor,cuenta,gerente,trinity,ayuda';

    const action = `${baseUrl}/api/voice/provider-menu-route?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;

    return xmlResponse(res, twiml(
      say(greeting, voice, langCode) +
      `<Gather input="speech dtmf" action="${action}" method="POST" numDigits="1" timeout="12" speechTimeout="auto" hints="${lang === 'es' ? hintsEs : hintsEn}">` +
      say(lang === 'es' ? menuEs : menuEn, voice, langCode) +
      `</Gather>` +
      say(lang === 'es' ? 'No recibí ninguna selección. Un momento, le conecto con Trinity.' : "I didn't catch a selection. One moment, connecting you with Trinity.", voice, langCode) +
      redirect(`${baseUrl}/api/voice/trinity-talk?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /provider-branded-menu error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// Spell out a license number (e.g. "C11608501") so the TTS voice reads it
// digit-by-digit instead of as "eleven million six hundred thousand...".
function spellLicense(license: string): string {
  return (license || '').split('').map(c => c).join(' ');
}

// ─── PROVIDER MENU ROUTER (Phase 28) ──────────────────────────────────────────
// Routes the caller's choice from /provider-branded-menu to the correct
// tenant-scoped handler. Every action stays inside the resolved provider
// workspace — dispatch goes to that tenant's dispatch desk, complaints go
// into that tenant's support_tickets (not CoAIleague platform support), etc.
voiceRouter.post('/provider-menu-route', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const Digits = (req.body.Digits as string) || '';
    const SpeechRaw = ((req.body.SpeechResult as string) || '').toLowerCase();

    // Speech-to-digit intent mapping (scoped to provider menu, not generic IVR)
    let digit = Digits;
    if (!digit && SpeechRaw) {
      if (/\b(incident|dispatch|emergency|help.*site|officer.*now)\b/.test(SpeechRaw) ||
          /\b(incidente|despacho|emergencia|ayuda.*sitio)\b/.test(SpeechRaw)) digit = '1';
      else if (/\b(coverage|add.*shift|extra.*officer|more.*staff)\b/.test(SpeechRaw) ||
               /\b(cobertura|agregar.*turno|personal.*extra)\b/.test(SpeechRaw)) digit = '2';
      else if (/\b(invoice|billing|bill|payment|charge)\b/.test(SpeechRaw) ||
               /\b(factura|facturación|pago|cobro)\b/.test(SpeechRaw)) digit = '3';
      else if (/\b(complaint|complain|report.*officer|bad.*officer|concern)\b/.test(SpeechRaw) ||
               /\b(queja|reclamo|oficial.*malo|denuncia)\b/.test(SpeechRaw)) digit = '4';
      else if (/\b(schedule|update.*service|change.*shift)\b/.test(SpeechRaw) ||
               /\b(horario|actualizar|cambiar.*turno)\b/.test(SpeechRaw)) digit = '5';
      else if (/\b(supervisor|on.*duty|manager.*duty)\b/.test(SpeechRaw) ||
               /\b(supervisor|de turno)\b/.test(SpeechRaw)) digit = '6';
      else if (/\b(account.*manager|message|leave.*note)\b/.test(SpeechRaw) ||
               /\b(gerente|mensaje|dejar)\b/.test(SpeechRaw)) digit = '7';
      else if (/\b(trinity|ai|talk.*to.*you|help)\b/.test(SpeechRaw) ||
               /\b(trinity|hablar)\b/.test(SpeechRaw)) digit = '0';
      else if (/\b(english|inglés|spanish|español)\b/.test(SpeechRaw)) digit = '9';
    }

    // Human-escalation keyword short-circuit — respected from ANY option
    if (/\b(operator|human|real.*person|agent|representative)\b/.test(SpeechRaw) ||
        /\b(operador|humano|persona|representante|agente)\b/.test(SpeechRaw)) {
      return xmlResponse(res, twiml(
        say(lang === 'es'
          ? 'Entendido. Le conectaré con un humano lo antes posible.'
          : 'Understood. I will connect you with a human as soon as possible.',
          lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
        redirect(`${baseUrl}/api/voice/schedule-callback?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    const qs = `sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;

    switch (digit) {
      case '1': // Incident / immediate dispatch — provider-scoped record + transcript
        return xmlResponse(res, twiml(
          say(lang === 'es'
            ? 'Entendido. Voy a grabar el incidente y alertar al despacho del proveedor. Explique lo ocurrido y dónde está ahora.'
            : "Understood. I'll record the incident and alert the provider's dispatch. Please explain what's happening and where you are right now.",
            lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
          `<Record ` +
            `action="${baseUrl}/api/voice/recording-done?caseType=provider_incident&${qs}" ` +
            `method="POST" maxLength="180" timeout="3" finishOnKey="*#" ` +
            `transcribe="true" ` +
            `transcribeCallback="${baseUrl}/api/voice/transcription-done?caseType=provider_incident&${qs}" ` +
            `playBeep="true"/>`
        ));

      case '2': // Add coverage / additional shift — take a short message
        return xmlResponse(res, twiml(
          say(lang === 'es'
            ? 'Por favor describa la cobertura adicional que necesita, dónde y cuándo. Nuestro equipo de programación lo contactará.'
            : 'Please describe the additional coverage you need, the location and time. Our scheduling team will follow up.',
            lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
          `<Record ` +
            `action="${baseUrl}/api/voice/recording-done?caseType=provider_coverage_request&${qs}" ` +
            `method="POST" maxLength="120" timeout="3" finishOnKey="*#" ` +
            `transcribe="true" ` +
            `transcribeCallback="${baseUrl}/api/voice/transcription-done?caseType=provider_coverage_request&${qs}" ` +
            `playBeep="true"/>`
        ));

      case '3': { // Billing / invoice — PIN-gated (Phase 29)
        const nextUrl = `${baseUrl}/api/voice/support-resolve?${qs}&topic=billing`;
        return xmlResponse(res, twiml(
          redirect(`${baseUrl}/api/voice/client-pin-gate?${qs}&next=${encodeURIComponent(nextUrl)}`)
        ));
      }

      case '4': // Client complaint — PROVIDER-scoped (not the platform-level guest intake)
        return xmlResponse(res, twiml(
          redirect(`${baseUrl}/api/voice/client-complaint-intake?${qs}&step=officer`)
        ));

      case '5': { // Schedule update — PIN-gated (Phase 29) then record
        const nextUrl = `${baseUrl}/api/voice/provider-schedule-record?${qs}`;
        return xmlResponse(res, twiml(
          redirect(`${baseUrl}/api/voice/client-pin-gate?${qs}&next=${encodeURIComponent(nextUrl)}`)
        ));
      }

      case '6': // Supervisor on duty — human escalation via callback
      case '7':
        return xmlResponse(res, twiml(
          redirect(`${baseUrl}/api/voice/schedule-callback?${qs}`)
        ));

      case '0': // Trinity free-talk — tenant-scoped context
        return xmlResponse(res, twiml(
          redirect(`${baseUrl}/api/voice/trinity-talk?${qs}`)
        ));

      case '9': {
        // Toggle language and re-announce the provider menu
        const newLang = lang === 'es' ? 'en' : 'es';
        try { await updateCallSession(req.body.CallSid || sessionId, { language: newLang }); } catch { /* non-fatal */ }
        return xmlResponse(res, twiml(
          redirect(`${baseUrl}/api/voice/provider-branded-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${newLang}`)
        ));
      }

      default: {
        const msg = lang === 'es'
          ? 'No recibí una opción válida. Le repito el menú.'
          : "I didn't catch a valid option. Let me replay the menu.";
        return xmlResponse(res, twiml(
          say(msg, lang === 'es' ? VOICE_ES : VOICE, lang === 'es' ? 'es-US' : 'en-US') +
          redirect(`${baseUrl}/api/voice/provider-branded-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
        ));
      }
    }
  } catch (err: any) {
    log.error('[VoiceRoutes] /provider-menu-route error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── CLIENT COMPLAINT INTAKE (Phase 28 — tenant-scoped) ───────────────────────
// Same shape as /guest-complaint-intake but scoped to the already-resolved
// provider workspace. The resulting support_tickets row goes INTO the
// provider tenant (with type='client_complaint', priority='high') so the
// tenant's own support team handles it. If no provider context is present,
// falls back to the platform-level guest intake.
voiceRouter.post('/client-complaint-intake', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const step = (req.query.step as string) || 'officer';
    const Speech = ((req.body.SpeechResult as string) || '').trim();

    if (!workspaceId) {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/guest-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&lang=${lang}&step=company`)
      ));
    }

    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    // Step 1 — ask officer name (optional). No need to ask company, we know it.
    if (step === 'officer' && !Speech) {
      const prompt = lang === 'es'
        ? 'Lamento escuchar esto. Si conoce el nombre del oficial, dígalo ahora. De lo contrario, diga "no lo sé".'
        : "I'm sorry to hear that. If you know the officer's name, say it now. Otherwise, say \"I don't know\".";
      return xmlResponse(res, twiml(
        `<Gather input="speech" action="${baseUrl}/api/voice/client-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=record" method="POST" timeout="10" speechTimeout="auto">` +
        say(prompt, voice, langCode) +
        `</Gather>` +
        redirect(`${baseUrl}/api/voice/client-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=record`)
      ));
    }

    // Step 2 — persist officer name (if any) and record the complaint verbatim
    if (step === 'record') {
      if (Speech) {
        try {
          const { pool } = await import('../db');
          await pool.query(
            `UPDATE voice_call_sessions
                SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                               jsonb_build_object('complaint_officer', $1::text)
              WHERE twilio_call_sid = $2`,
            [Speech.slice(0, 200), req.body.CallSid || sessionId],
          );
        } catch { /* non-fatal */ }
      }
      const prompt = lang === 'es'
        ? 'Gracias. Ahora por favor describa lo sucedido con sus propias palabras. Estamos escuchando.'
        : 'Thank you. Now please describe what happened in your own words. We are listening.';
      return xmlResponse(res, twiml(
        say(prompt, voice, langCode) +
        `<Record ` +
          `action="${baseUrl}/api/voice/recording-done?caseType=client_complaint&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}" ` +
          `method="POST" maxLength="180" timeout="3" finishOnKey="*#0123456789" ` +
          `transcribe="true" ` +
          `transcribeCallback="${baseUrl}/api/voice/transcription-done?caseType=client_complaint&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}" ` +
          `playBeep="true"/>`
      ));
    }

    // Unknown step — restart
    return xmlResponse(res, twiml(
      redirect(`${baseUrl}/api/voice/client-complaint-intake?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=officer`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /client-complaint-intake error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── SRA AUDITOR IDENTIFY (Phase 28) ──────────────────────────────────────────
// Entry point for regulatory auditors (TX PSB, CA BSIS, etc). Reached via
// speech keyword ("auditor", "inspector", "state", "regulatory") or from the
// general menu. Gathers the badge number, verifies against sra_accounts,
// sets auditor_verified on the session, and redirects to a read-only
// compliance-disclosure menu that surfaces workspace compliance posture
// without handing over mutable data.
voiceRouter.post('/sra-identify', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const Speech = ((req.body.SpeechResult as string) || '').trim();
    const Digits = (req.body.Digits as string) || '';
    const step = (req.query.step as string) || 'prompt-badge';

    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    // Step 1 — prompt for badge number
    if (step === 'prompt-badge' && !Speech && !Digits) {
      const prompt = lang === 'es'
        ? 'Bienvenido, auditor. Por favor diga o ingrese su número de placa para verificar su identidad.'
        : 'Welcome, auditor. Please say or enter your badge number to verify your identity.';
      return xmlResponse(res, twiml(
        `<Gather input="speech dtmf" action="${baseUrl}/api/voice/sra-identify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=verify-badge" method="POST" timeout="15" speechTimeout="auto" hints="badge,number,auditor,inspector">` +
        say(prompt, voice, langCode) +
        `</Gather>` +
        say(lang === 'es' ? 'No recibí el número de placa. Adiós.' : "I did not receive a badge number. Goodbye.", voice, langCode)
      ));
    }

    // Step 2 — verify badge against sra_accounts (read-only)
    if (step === 'verify-badge') {
      const badge = (Digits || Speech || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 40);
      let account: { id: string; stateCode: string; status: string; fullLegalName: string } | null = null;
      try {
        const { pool } = await import('../db');
        const r = await pool.query(
          `SELECT id, state_code, status, full_legal_name FROM sra_accounts WHERE UPPER(badge_number) = $1 LIMIT 1`,
          [badge],
        );
        if (r.rows.length) account = {
          id: r.rows[0].id,
          stateCode: r.rows[0].state_code,
          status: r.rows[0].status,
          fullLegalName: r.rows[0].full_legal_name,
        };
      } catch (lookupErr: any) {
        log.warn('[VoiceRoutes] /sra-identify DB error:', lookupErr?.message);
      }

      if (!account) {
        return xmlResponse(res, twiml(
          say(lang === 'es'
            ? 'No encontré esa placa. Nuestro sistema de auditor requiere registro previo. Por favor contacte a soporte@coaileague.com.'
            : "I could not find that badge. Our auditor system requires prior enrollment. Please email support@coaileague.com.",
            voice, langCode)
        ));
      }

      if (account.status !== 'verified') {
        return xmlResponse(res, twiml(
          say(lang === 'es'
            ? `Su cuenta tiene estado ${account.status} y requiere aprobación del administrador. Por favor contacte a soporte.`
            : `Your account status is ${account.status} and requires administrator approval. Please contact support.`,
            voice, langCode)
        ));
      }

      // Mark session as auditor-verified (disclosure mode only — read-only)
      try {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                             jsonb_build_object('auditor_verified', TRUE,
                                                'auditor_account_id', $1::text,
                                                'auditor_state', $2::text)
            WHERE twilio_call_sid = $3`,
          [account.id, account.stateCode, req.body.CallSid || sessionId],
        );
      } catch { /* non-fatal */ }

      // Log the auditor call entry
      try {
        const { pool } = await import('../db');
        await pool.query(
          `INSERT INTO sra_audit_log (sra_account_id, action, action_payload, ip_address, created_at)
           VALUES ($1, 'voice_identify', $2::jsonb, 'twilio-voice', NOW())`,
          [account.id, JSON.stringify({ callSid: req.body.CallSid, stateCode: account.stateCode })],
        );
      } catch { /* non-fatal if table name differs */ }

      const greeting = lang === 'es'
        ? `Verificado. Bienvenido, auditor ${account.fullLegalName} del estado ${account.stateCode}. Esta llamada se registra por cumplimiento. Escuche las opciones.`
        : `Verified. Welcome, Auditor ${account.fullLegalName} from state ${account.stateCode}. This call is logged for compliance. Please listen to the options.`;

      const menu = lang === 'es'
        ? 'Marque 1 para revisar el cumplimiento de una empresa específica. Marque 2 para verificar el estado de licencia de un oficial. Marque 3 para dejar una nota formal en el expediente de una empresa. Marque 0 para hablar con Trinity.'
        : 'Press 1 to review compliance posture for a specific company. Press 2 to verify an officer\'s license status. Press 3 to leave a formal note on a company\'s compliance record. Press 0 to speak with Trinity.';

      return xmlResponse(res, twiml(
        say(greeting, voice, langCode) +
        `<Gather input="speech dtmf" action="${baseUrl}/api/voice/trinity-talk?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&auditorMode=1" method="POST" numDigits="1" timeout="12" speechTimeout="auto">` +
        say(menu, voice, langCode) +
        `</Gather>` +
        // Fall-through — route to Trinity in auditor mode
        redirect(`${baseUrl}/api/voice/trinity-talk?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&auditorMode=1`)
      ));
    }

    return xmlResponse(res, twiml(
      redirect(`${baseUrl}/api/voice/sra-identify?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&step=prompt-badge`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /sra-identify error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── PROVIDER SCHEDULE RECORDING (Phase 29) ───────────────────────────────────
// Reached after /client-pin-gate succeeds for option 5 (update services).
// Records the caller's schedule-change request verbatim and routes to the
// existing transcription-done → support_tickets pipeline as
// provider_schedule_update.
voiceRouter.post('/provider-schedule-record', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';
    const qs = `sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
    return xmlResponse(res, twiml(
      say(lang === 'es'
        ? 'Describa los cambios de horario que necesita.'
        : 'Please describe the schedule changes you need.',
        voice, langCode) +
      `<Record ` +
        `action="${baseUrl}/api/voice/recording-done?caseType=provider_schedule_update&${qs}" ` +
        `method="POST" maxLength="120" timeout="3" finishOnKey="*#" ` +
        `transcribe="true" ` +
        `transcribeCallback="${baseUrl}/api/voice/transcription-done?caseType=provider_schedule_update&${qs}" ` +
        `playBeep="true"/>`
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /provider-schedule-record error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── CLIENT PIN GATE (Phase 29) ───────────────────────────────────────────────
// Gates sensitive tenant-scoped actions (billing payment, schedule updates,
// account changes) behind a client PIN. Caller is resolved by CLI match
// against clients.phone in the already-resolved provider workspace. PIN is
// verified via verifyEntityPin('client', ...). On success the session is
// stamped client_pin_verified=true and the caller is redirected to `next`.
// On failure, up to 3 attempts; then 5-min lockout keyed per (workspace, phone).
const _clientPinLockout = new Map<string, { attempts: number; lockedUntil: number }>();
const CLIENT_PIN_MAX = 3;
const CLIENT_PIN_LOCK_MS = 5 * 60 * 1000;
function _clientPinKey(workspaceId: string, phone: string): string {
  return `${workspaceId}:${(phone || '').replace(/\D/g, '')}`;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _clientPinLockout.entries()) {
    if (v.lockedUntil > 0 && v.lockedUntil <= now) _clientPinLockout.delete(k);
  }
}, 10 * 60 * 1000).unref();

voiceRouter.post('/client-pin-gate', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const nextUrl = (req.query.next as string) || '';
    const Digits = (req.body.Digits as string) || '';
    const callerPhone = (req.body.From as string) || '';
    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    if (!workspaceId || !nextUrl) {
      return xmlResponse(res, twiml(
        say(lang === 'es' ? 'Configuración incompleta. Adiós.' : 'Configuration error. Goodbye.', voice, langCode)
      ));
    }

    // Lockout check
    const lockKey = _clientPinKey(workspaceId, callerPhone);
    const lockState = _clientPinLockout.get(lockKey);
    if (lockState && lockState.lockedUntil > Date.now()) {
      const mins = Math.ceil((lockState.lockedUntil - Date.now()) / 60000);
      return xmlResponse(res, twiml(
        say(lang === 'es'
          ? `Acceso bloqueado por seguridad. Intente de nuevo en ${mins} minuto${mins === 1 ? '' : 's'}. Adiós.`
          : `Access locked for security. Try again in ${mins} minute${mins === 1 ? '' : 's'}. Goodbye.`,
          voice, langCode)
      ));
    }

    // Step 1: prompt for PIN
    if (!Digits) {
      const prompt = lang === 'es'
        ? 'Por seguridad, por favor ingrese su PIN de cliente de 4 a 8 dígitos.'
        : 'For security, please enter your 4 to 8 digit client PIN.';
      return xmlResponse(res, twiml(
        `<Gather input="dtmf" action="${baseUrl}/api/voice/client-pin-gate?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&next=${encodeURIComponent(nextUrl)}" method="POST" timeout="15" numDigits="8" finishOnKey="#">` +
        say(prompt, voice, langCode) +
        `</Gather>` +
        say(lang === 'es' ? 'No recibí PIN. Adiós.' : 'No PIN received. Goodbye.', voice, langCode)
      ));
    }

    // Step 2: resolve client by caller phone + verify PIN
    let clientId: string | null = null;
    try {
      const { pool } = await import('../db');
      const phoneClean = (callerPhone || '').replace(/\D/g, '').slice(-10);
      if (phoneClean.length >= 7) {
        const r = await pool.query(
          `SELECT id FROM clients
            WHERE workspace_id = $1
              AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE '%' || $2
            LIMIT 1`,
          [workspaceId, phoneClean],
        );
        if (r.rows.length) clientId = r.rows[0].id;
      }
    } catch (err: any) {
      log.warn('[VoiceRoutes] /client-pin-gate client lookup failed:', err?.message);
    }

    if (!clientId) {
      return xmlResponse(res, twiml(
        say(lang === 'es'
          ? 'No puedo identificar su cuenta por este número. Le conectaré con un humano.'
          : 'I cannot identify your account from this number. Let me connect you with a human.',
          voice, langCode) +
        redirect(`${baseUrl}/api/voice/schedule-callback?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    const { verifyEntityPin } = await import('../services/entityPinService');
    const result = await verifyEntityPin({ entity: 'client', entityId: clientId, workspaceId, pin: Digits });

    if (result.valid) {
      _clientPinLockout.delete(lockKey);
      // Stamp session
      try {
        const { pool } = await import('../db');
        await pool.query(
          `UPDATE voice_call_sessions
              SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                             jsonb_build_object(
                               'client_pin_verified', TRUE,
                               'client_id', $1::text
                             )
            WHERE twilio_call_sid = $2`,
          [clientId, req.body.CallSid || sessionId],
        );
      } catch { /* non-fatal */ }

      return xmlResponse(res, twiml(
        say(lang === 'es' ? 'Verificado. Un momento.' : 'Verified. One moment.', voice, langCode) +
        redirect(nextUrl)
      ));
    }

    // PIN invalid — record + decide
    const cur = _clientPinLockout.get(lockKey) || { attempts: 0, lockedUntil: 0 };
    cur.attempts += 1;
    if (cur.attempts >= CLIENT_PIN_MAX) {
      cur.lockedUntil = Date.now() + CLIENT_PIN_LOCK_MS;
      _clientPinLockout.set(lockKey, cur);
      const mins = Math.ceil(CLIENT_PIN_LOCK_MS / 60000);
      return xmlResponse(res, twiml(
        say(lang === 'es'
          ? `Demasiados intentos. Acceso bloqueado por ${mins} minutos. Contacte a su proveedor. Adiós.`
          : `Too many attempts. Access locked for ${mins} minutes. Contact your provider. Goodbye.`,
          voice, langCode)
      ));
    }
    _clientPinLockout.set(lockKey, cur);
    const remaining = CLIENT_PIN_MAX - cur.attempts;
    return xmlResponse(res, twiml(
      say(lang === 'es'
        ? `PIN incorrecto. Le quedan ${remaining} intento${remaining === 1 ? '' : 's'}.`
        : `Incorrect PIN. You have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        voice, langCode) +
      redirect(`${baseUrl}/api/voice/client-pin-gate?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&next=${encodeURIComponent(nextUrl)}`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /client-pin-gate error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// ─── OWNER AUTHORITY MENU (Phase 29) ──────────────────────────────────────────
// Reached after /owner-pin-verify succeeds. Gives the owner voice-accessible
// summaries of high-authority queues (pending payroll, shift overrides,
// compliance alerts, KPIs). Actual mutations (approve payroll, approve an
// override) require a signed SMS confirmation link — voice can only SUMMARISE
// and TRIGGER that link. This prevents voice-only authorization of money
// movements while still giving owners quick situational awareness.
voiceRouter.post('/owner-menu', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);
    const sessionId = (req.query.sessionId as string) || req.body.CallSid || '';
    const workspaceId = (req.query.workspaceId as string) || '';
    const Digits = (req.body.Digits as string) || '';
    const Speech = ((req.body.SpeechResult as string) || '').toLowerCase();
    const callSid = (req.body.CallSid as string) || sessionId;
    const voice = lang === 'es' ? VOICE_ES : VOICE;
    const langCode = lang === 'es' ? 'es-US' : 'en-US';

    // Verify owner_pin_verified is still set on this session
    let ownerVerified = false;
    let callerUserId = '';
    let callerPhone = '';
    try {
      const { pool } = await import('../db');
      const r = await pool.query(
        `SELECT metadata, caller_number FROM voice_call_sessions WHERE twilio_call_sid = $1 LIMIT 1`,
        [callSid],
      );
      const meta = (r.rows[0]?.metadata as Record<string, any> | null) || {};
      ownerVerified = !!meta.owner_pin_verified;
      callerUserId = meta.user_id || '';
      callerPhone = r.rows[0]?.caller_number || (req.body.From as string) || '';
    } catch { /* non-fatal */ }

    if (!ownerVerified) {
      return xmlResponse(res, twiml(
        say(lang === 'es'
          ? 'Esta función requiere verificación de propietario. Le llevaré al menú principal.'
          : 'This feature requires owner verification. Taking you to the main menu.',
          voice, langCode) +
        redirect(`${baseUrl}/api/voice/main-menu-route?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    // Map speech → digit
    let digit = Digits;
    if (!digit && Speech) {
      if (/\b(payroll|paycheck)\b/.test(Speech) || /\b(nómina|pago)\b/.test(Speech)) digit = '1';
      else if (/\b(override|shift.*approval)\b/.test(Speech) || /\b(anular|aprobar)\b/.test(Speech)) digit = '2';
      else if (/\b(compliance|alert|expir)\b/.test(Speech) || /\b(cumplimiento|alerta|expir)\b/.test(Speech)) digit = '3';
      else if (/\b(kpi|summary|today|numbers)\b/.test(Speech) || /\b(resumen|números|hoy)\b/.test(Speech)) digit = '4';
      else if (/\b(back|normal|staff.*menu)\b/.test(Speech) || /\b(regresar|normal|personal)\b/.test(Speech)) digit = '0';
    }

    // Helper to send the owner an SMS action link (non-blocking)
    const sendActionLink = async (subject: string, path: string): Promise<boolean> => {
      if (!callerPhone) return false;
      try {
        const { sendSMS } = await import('../services/smsService');
        const url = `${baseUrl}${path}`;
        await sendSMS({
          to: callerPhone,
          body: `[${subject}] Secure action link: ${url}`.slice(0, 280),
          workspaceId,
          type: 'owner_action_link',
        } as any);
        return true;
      } catch (err: any) {
        log.warn('[VoiceRoutes] /owner-menu SMS failed:', err?.message);
        return false;
      }
    };

    if (digit === '1') {
      // Pending payroll approvals — announce count + send SMS action link
      let pending = 0; let totalCents = 0;
      try {
        const { pool } = await import('../db');
        const r = await pool.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount),0)::bigint AS sum
             FROM payroll_runs
            WHERE workspace_id = $1
              AND status IN ('pending_approval','pending')`,
          [workspaceId],
        );
        pending = r.rows[0]?.cnt || 0;
        totalCents = Number(r.rows[0]?.sum || 0);
      } catch { /* non-fatal — table name may differ */ }
      const amount = (totalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      await sendActionLink('Payroll', `/payroll?action=approve&workspace=${encodeURIComponent(workspaceId)}`);
      const msg = pending === 0
        ? (lang === 'es' ? 'No tiene nóminas pendientes de aprobación.' : 'You have no payroll runs pending approval.')
        : (lang === 'es'
            ? `Tiene ${pending} nómina${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} por un total de ${amount}. Le envié un enlace seguro por mensaje de texto para revisar y aprobar.`
            : `You have ${pending} payroll run${pending === 1 ? '' : 's'} pending, totalling ${amount}. I sent a secure link to your phone to review and approve.`);
      return xmlResponse(res, twiml(
        say(msg, voice, langCode) +
        redirect(`${baseUrl}/api/voice/owner-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    if (digit === '2') {
      // Shift override approvals queue
      let pending = 0;
      try {
        const { pool } = await import('../db');
        const r = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM shift_override_requests
            WHERE workspace_id = $1 AND status = 'pending'`,
          [workspaceId],
        );
        pending = r.rows[0]?.cnt || 0;
      } catch { /* table may not exist on all envs — non-fatal */ }
      await sendActionLink('Overrides', `/shifts?filter=pending-overrides&workspace=${encodeURIComponent(workspaceId)}`);
      const msg = pending === 0
        ? (lang === 'es' ? 'No hay solicitudes de anulación pendientes.' : 'You have no pending shift override requests.')
        : (lang === 'es'
            ? `Tiene ${pending} solicitud${pending === 1 ? '' : 'es'} de anulación. Revíselas con el enlace que envié por texto.`
            : `You have ${pending} shift override request${pending === 1 ? '' : 's'}. Review them via the link I just texted you.`);
      return xmlResponse(res, twiml(
        say(msg, voice, langCode) +
        redirect(`${baseUrl}/api/voice/owner-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    if (digit === '3') {
      // Compliance alerts — count expiring certs + unverified guard cards
      let alerts = 0;
      try {
        const { pool } = await import('../db');
        const r = await pool.query(
          `SELECT COUNT(*)::int AS cnt
             FROM employee_certifications
            WHERE workspace_id = $1
              AND expiration_date IS NOT NULL
              AND expiration_date <= NOW() + INTERVAL '30 days'
              AND status = 'active'`,
          [workspaceId],
        );
        alerts = r.rows[0]?.cnt || 0;
      } catch { /* non-fatal */ }
      const msg = alerts === 0
        ? (lang === 'es' ? 'No tiene alertas de cumplimiento urgentes.' : 'You have no urgent compliance alerts.')
        : (lang === 'es'
            ? `Atención: ${alerts} certificación${alerts === 1 ? '' : 'es'} vencen en los próximos 30 días.`
            : `Attention: ${alerts} certification${alerts === 1 ? '' : 's'} expire in the next 30 days.`);
      return xmlResponse(res, twiml(
        say(msg, voice, langCode) +
        redirect(`${baseUrl}/api/voice/owner-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    if (digit === '4') {
      // KPI summary — shifts today + employees on duty + invoices due this week
      let shiftsToday = 0; let onDuty = 0; let invoicesDue = 0; let dueCents = 0;
      try {
        const { pool } = await import('../db');
        const sh = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM shifts
            WHERE workspace_id = $1 AND DATE(start_time) = CURRENT_DATE`,
          [workspaceId],
        );
        shiftsToday = sh.rows[0]?.cnt || 0;
        const od = await pool.query(
          `SELECT COUNT(DISTINCT employee_id)::int AS cnt FROM time_entries
            WHERE workspace_id = $1 AND clock_out IS NULL AND clock_in >= NOW() - INTERVAL '24 hours'`,
          [workspaceId],
        );
        onDuty = od.rows[0]?.cnt || 0;
        const inv = await pool.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total),0)::numeric AS sum FROM invoices
            WHERE workspace_id = $1
              AND status IN ('sent','overdue')
              AND due_date <= NOW() + INTERVAL '7 days'`,
          [workspaceId],
        );
        invoicesDue = inv.rows[0]?.cnt || 0;
        dueCents = Math.round(Number(inv.rows[0]?.sum || 0) * 100);
      } catch { /* non-fatal */ }
      const dueAmount = (dueCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      const msg = lang === 'es'
        ? `Hoy: ${shiftsToday} turno${shiftsToday === 1 ? '' : 's'}, ${onDuty} oficial${onDuty === 1 ? '' : 'es'} en servicio. Esta semana vencen ${invoicesDue} factura${invoicesDue === 1 ? '' : 's'} por ${dueAmount}.`
        : `Today: ${shiftsToday} shift${shiftsToday === 1 ? '' : 's'}, ${onDuty} officer${onDuty === 1 ? '' : 's'} on duty. This week: ${invoicesDue} invoice${invoicesDue === 1 ? '' : 's'} due totalling ${dueAmount}.`;
      return xmlResponse(res, twiml(
        say(msg, voice, langCode) +
        redirect(`${baseUrl}/api/voice/owner-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`)
      ));
    }

    if (digit === '0') {
      return xmlResponse(res, twiml(
        redirect(`${baseUrl}/api/voice/main-menu-route?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&_d=4`)
      ));
    }

    // First call — announce the menu
    const greeting = lang === 'es'
      ? 'Bienvenido al menú de propietario. Tiene autoridad completa en esta llamada.'
      : 'Welcome to the owner menu. You have full authority on this call.';
    const menu = lang === 'es'
      ? 'Marque 1 para ver nóminas pendientes de aprobación. Marque 2 para anulaciones de turnos pendientes. Marque 3 para alertas de cumplimiento. Marque 4 para el resumen del día. Marque 0 para el menú normal.'
      : 'Press 1 for pending payroll approvals. Press 2 for shift override requests. Press 3 for compliance alerts. Press 4 for a daily KPI summary. Press 0 for the normal staff menu.';
    return xmlResponse(res, twiml(
      say(greeting, voice, langCode) +
      `<Gather input="speech dtmf" action="${baseUrl}/api/voice/owner-menu?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}" method="POST" numDigits="1" timeout="12" speechTimeout="auto" hints="payroll,override,compliance,summary,kpi,menu">` +
      say(menu, voice, langCode) +
      `</Gather>` +
      redirect(`${baseUrl}/api/voice/main-menu-route?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&_d=4`)
    ));
  } catch (err: any) {
    log.error('[VoiceRoutes] /owner-menu error:', err?.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
  }
});

// Mount the authenticated management sub-router onto the main voice router
voiceRouter.use(mgmtRouter);
