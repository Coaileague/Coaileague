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
import { voiceSmsMeteringService } from '../services/billing/voiceSmsMeteringService';
import { handleSales } from '../services/trinityVoice/extensions/salesExtension';
import { handleClientSupport } from '../services/trinityVoice/extensions/clientExtension';
import { handleEmploymentVerification } from '../services/trinityVoice/extensions/verifyExtension';
import {
  handleStaff,
  handleClockInStep1,
  handleCollectPin,
  processClockIn,
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
      log.info('[VoiceRoutes] Voice tables initialized');
    } finally {
      client.release();
    }
  } catch (err: any) {
    log.warn('[VoiceRoutes] Voice table init failed (non-fatal):', err.message);
  }
}

// ─── Twilio Signature Validation (using official Twilio SDK) ─────────────────

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

async function validateTwilioSignature(req: Request): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) {
    if (process.env.NODE_ENV === 'production') {
      log.error('[VoiceRoutes] TWILIO_AUTH_TOKEN not set in production!');
      return false;
    }
    log.warn('[VoiceRoutes] TWILIO_AUTH_TOKEN not set — skipping signature validation in dev');
    return true;
  }

  const twilioSig = req.headers['x-twilio-signature'] as string;
  if (!twilioSig) return false;

  const url = `${getBaseUrl(req)}${req.originalUrl}`;
  const params = req.body || {};

  try {
    // Use Twilio's official validateRequest to match their exact HMAC algorithm
    // including URL normalization and parameter serialization edge-cases.
    const { default: twilio } = await import('twilio');
    return twilio.validateRequest(TWILIO_AUTH_TOKEN, twilioSig, url, params);
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
  return process.env.BASE_URL ||
    `${req.protocol}://${req.get('host')}`;
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

// ─── 3. MAIN MENU ROUTE ───────────────────────────────────────────────────────

voiceRouter.post('/main-menu-route', twilioSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { CallSid, Digits, To } = req.body;
    const lang = getLang(req);
    const baseUrl = getBaseUrl(req);

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
        redirect(`${baseUrl}/api/voice/main-menu-route?lang=${lang}`)
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
          say(caseCheckPrompt, lang === 'es' ? 'Polly.Lupe-Neural' : 'Polly.Joanna-Neural', lang === 'es' ? 'es-US' : 'en-US') +
          `</Gather>` +
          say(lang === 'es' ? 'No se recibió entrada. Adiós.' : 'No input received. Goodbye.')
        ));
      }
      case '0': {
        // Agent case management — PIN-gated
        const agentClearAction = `${baseUrl}/api/voice/agent-clear?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}`;
        return xmlResponse(res, twiml(
          `<Gather input="dtmf" action="${agentClearAction}&step=pin" method="POST" numDigits="4" timeout="10">` +
          say('Agent case management. Please enter your 4-digit PIN.') +
          `</Gather>` +
          say('No PIN entered. Goodbye.')
        ));
      }
      case '9': {
        // Toggle language
        const newLang = lang === 'en' ? 'es' : 'en';
        return xmlResponse(res, buildMainIVR(newLang, baseUrl, extEnabled));
      }
      default:
        return xmlResponse(res, buildMainIVR(lang, baseUrl, extEnabled));
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
      default:
        return xmlResponse(res, handleStaff(baseParams));
    }
  } catch (err: any) {
    log.error('[VoiceRoutes] Staff-menu error:', err.message);
    xmlResponse(res, twiml('<Say>An error occurred. Goodbye.</Say>'));
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
        setImmediate(async () => {
          try {
            const twilio = (await import('twilio')).default;
            const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const baseUrl = process.env.APP_URL || '';
            // Use a typed create call; statusCallbackUrl is a valid Twilio param
            // transcriptions.create accepts optional params beyond the TS typings
            await (twilioClient.recordings(RecordingSid).transcriptions.create as (
              opts: { statusCallbackUrl?: string }
            ) => Promise<unknown>)({
              statusCallbackUrl: `${baseUrl}/api/voice/transcription-done`,
            });
            log.info(`[VoiceRoutes] Transcription requested for recording ${RecordingSid}`);
          } catch (txErr: any) {
            log.warn(`[VoiceRoutes] Transcription request failed (non-fatal): ${txErr.message}`);
          }
        });
      }
    }

    log.info(`[VoiceRoutes] Recording done for ext=${ext} callSid=${CallSid} duration=${RecordingDuration}s`);
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
        const orgName = workspace?.name || 'your organization';
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

    // All other inbound SMS — acknowledge without action
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
