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
  const baseUrl = (process.env.BASE_URL || 'https://www.coaileague.com').replace(/\/$/, '');
  const url = `${baseUrl}${req.originalUrl}`;

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
  if (process.env.VOICE_DEBUG_BYPASS === 'true') {
    log.warn('VOICE_DEBUG_BYPASS active — skipping Twilio signature validation');
    next();
    return;
  }
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
  const lang = req.query.lang || req.body.lang || 'en';
  return lang === 'es' ? 'es' : 'en';
}

async function getSession(callSid: string): Promise<typeof voiceCallSessions.$inferSelect | null> {
  const [session] = await db.select()
    .from(voiceCallSessions)
    .where(eq(voiceCallSessions.twilioCallSid, callSid))
    .limit(1);
  return session || null;
}

// ─── 1. INBOUND WEBHOOK ───────────────────────────────────────────────────────

voiceRouter.post('/inbound', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { To, From, CallSid } = req.body;
    const baseUrl = getBaseUrl(req);

    log.info(`[VoiceRoutes] Inbound call: ${From} → ${To} (${CallSid})`);

    // Phase 18D — fire-and-forget caller-ID risk lookup. Result is cached and
    // available to downstream verifiers and the dashboard via session metadata.
    void (async () => {
      try {
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
      } catch (e: any) {
        log.warn('[VoiceRoutes] Caller-ID lookup background failed:', e?.message);
      }
    })();

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
        await updateCallSession(CallSid, {
          metadata: {
            client_provider_name: resolvedProviderName || spoken,
            client_provider_workspace_id: resolvedProviderWorkspaceId,
            client_provider_resolved: !!resolvedProviderWorkspaceId,
          },
        }).catch(() => {});
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
      case '2':
        return xmlResponse(res, handleClientSupport(baseParams));
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
        scheduleNonBlocking('voice.transcription-request', async () => {
          const twilio = (await import('twilio')).default;
          const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          const baseUrl = process.env.APP_URL || '';
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
    // platform-approved wrapper, per CLAUDE.md §F) so Twilio gets a fast
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
    const { CallSid, TranscriptionText, TranscriptionStatus, RecordingSid } = req.body;

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
            twilioCostCents: Math.ceil((durationSec / 60) * 220),
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

    const issue = (SpeechResult || '').trim();

    const sayEn = (text: string) => `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;
    const sayEs = (text: string) => `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;
    const sayL = (en: string, es: string) => lang === 'es' ? sayEs(es) : sayEn(en);

    if (!issue || issue.length < 5) {
      const action = `${baseUrl}/api/voice/support-resolve?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;
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
      payload: { issue: issue.slice(0, 300) },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Attempt AI resolution (max ~6s)
    const aiResult = await resolveWithTrinityBrain({ issue, workspaceId, language: lang });

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
      // Mark session as AI-resolved so the status callback can report the correct outcome
      updateCallSession(CallSid, {
        metadata: { ai_resolved: true, ai_attempted: true, ai_model: aiModel, extension: 'client_support' },
      }).catch(() => {});
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

    // Caller wants human help — mark session as escalated
    updateCallSession(CallSid, {
      metadata: { ai_resolved: false, ai_attempted: true, escalated: true, ai_model: aiModel, extension: 'client_support' },
    }).catch(() => {});
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
    // Awaited to satisfy "no fire-and-forget" rule (CLAUDE.md §9); sendSMS
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
            twilioCostCents: Math.ceil((durationSec / 60) * 220),
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
      await updateCallSession(CallSid, {
        metadata: { verified_by: '2fa_email', employee_id: employeeId },
      }).catch(() => {});
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

  const aiResult = await resolveWithTrinityBrain({ issue, workspaceId, language: lang });

  const issueEncoded = encodeURIComponent(issue.slice(0, 500));
  const nameAction = `${baseUrl}/api/voice/support-gather-name?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&issue=${issueEncoded}&aiAttempted=true&aiModel=${aiResult.modelUsed || 'none'}`;
  const escalationPhrase = lang === 'es' ? getEscalationPhraseEs() : getEscalationPhraseEn();
  const namePhrase = lang === 'es' ? getNameGatherPhraseEs() : getNameGatherPhraseEn();

  // If the AI cannot resolve it, or we've reached the 5-turn ceiling, stop
  // looping and escalate directly to a support case.
  if (!aiResult.canResolve || turn >= 5) {
    return twiml(
      say(aiResult.answer, voiceId, langCode) +
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

      // Best-effort agent notification — awaited per CLAUDE.md §B
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

// ─── Helper: extract QS params set during the call flow ──────────────────────

function extractQS(req: Request): { sessionId: string; workspaceId: string } {
  const sessionId = (req.query.sessionId as string) || (req.body.sessionId as string) || '';
  const workspaceId = (req.query.workspaceId as string) || (req.body.workspaceId as string) || '';
  return { sessionId, workspaceId };
}

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

// Mount the authenticated management sub-router onto the main voice router
voiceRouter.use(mgmtRouter);
