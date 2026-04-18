/**
 * TRINITY VOICE ORCHESTRATOR — Phase 56 / 57
 * ============================================
 * Core IVR engine for the Trinity Voice Phone System.
 * Answers calls, builds TwiML menus, and dispatches to extension handlers.
 * Call usage is tracked per-minute for overage billing (flat-rate model).
 *
 * Call flow:
 *   Inbound → buildMainMenu (English/Spanish) → extension handler → action
 *   Status callback → recordCallUsage → audit log
 */

import { db } from '../../db';
import {
  workspacePhoneNumbers,
  voiceCallSessions,
  voiceCallActions,
  type VoiceCallSession,
} from '../../../shared/schema/domains/voice';
import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { trinityHelpaiCommandBus } from '../helpai/trinityHelpaiCommandBus';
const log = createLogger('voiceOrchestrator');


// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COST_PER_MINUTE_CENTS = 2; // ~$0.02/min — used for overage billing calculation
const VOICE = 'Polly.Joanna-Neural';    // Amazon Polly Neural — most human-sounding
const VOICE_ES = 'Polly.Lupe-Neural';   // Amazon Polly Neural, US Spanish female

// ─── TwiML Builder Helpers ────────────────────────────────────────────────────

export function twiml(xml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${xml}</Response>`;
}

// SSML prosody wrapping makes Trinity sound warm and human instead of robotic.
// - rate="92%" slightly slower than default for natural cadence
// - pitch="+2%" adds subtle warmth
// - <break> tags insert natural pauses after punctuation
export function say(text: string, voice: string = VOICE, language: string = 'en-US'): string {
  const ssmlText = text
    .replace(/\. /g, '.<break time="400ms"/> ')
    .replace(/\? /g, '?<break time="400ms"/> ')
    .replace(/! /g, '!<break time="300ms"/> ')
    .replace(/, /g, ',<break time="150ms"/> ');
  return `<Say voice="${voice}" language="${language}"><prosody rate="92%" pitch="+2%">${ssmlText}</prosody></Say>`;
}

// Quicker cadence for short acknowledgements / confirmations
export function sayFast(text: string, voice: string = VOICE, language: string = 'en-US'): string {
  return `<Say voice="${voice}" language="${language}"><prosody rate="100%">${text}</prosody></Say>`;
}

// Warmer, slower cadence for emotional / support / emergency contexts
export function sayWarm(text: string, voice: string = VOICE, language: string = 'en-US'): string {
  return `<Say voice="${voice}" language="${language}"><prosody rate="88%" pitch="+4%">${text}</prosody></Say>`;
}

function gather(opts: {
  action: string;
  numDigits?: number;
  timeout?: number;
  input?: string;
  speechTimeout?: string;
}, children: string): string {
  const attrs = [
    `action="${opts.action}"`,
    `method="POST"`,
    `timeout="${opts.timeout ?? 10}"`,
    opts.numDigits !== undefined ? `numDigits="${opts.numDigits}"` : '',
    opts.input ? `input="${opts.input}"` : 'input="dtmf"',
    opts.speechTimeout ? `speechTimeout="${opts.speechTimeout}"` : '',
  ].filter(Boolean).join(' ');
  return `<Gather ${attrs}>${children}</Gather>`;
}

export function redirect(url: string): string {
  return `<Redirect method="POST">${url}</Redirect>`;
}

function pause(seconds: number = 1): string {
  return `<Pause length="${seconds}"/>`;
}

// ─── Usage Tracking ───────────────────────────────────────────────────────────
// Call minutes are recorded for overage billing calculation under the flat-rate model.
// No balance is debited — usage is tallied and compared against tier allowances at billing time.

// ─── Workspace Resolution ─────────────────────────────────────────────────────

export async function resolveWorkspaceFromPhoneNumber(to: string): Promise<{
  workspaceId: string;
  phoneRecord: typeof workspacePhoneNumbers.$inferSelect;
} | null> {
  const [phoneRecord] = await db.select()
    .from(workspacePhoneNumbers)
    .where(and(
      eq(workspacePhoneNumbers.phoneNumber, to),
      eq(workspacePhoneNumbers.isActive, true),
    ))
    .limit(1);

  if (!phoneRecord) return null;
  return { workspaceId: phoneRecord.workspaceId, phoneRecord };
}

// ─── Main Menu Builder ────────────────────────────────────────────────────────

// extEnabled: optional map from extension key to boolean (defaults to all enabled)
export function buildMainIVR(
  lang: 'en' | 'es',
  baseUrl: string,
  extEnabled: Record<string, boolean> = {}
): string {
  const enabled = (key: string) => extEnabled[key] !== false;

  if (lang === 'es') {
    const parts: string[] = ['Hola, soy Trinity. Estoy aquí para ayudarle. '];
    if (enabled('sales'))                   parts.push('Para ventas, marque 1. ');
    if (enabled('client_support'))          parts.push('Para soporte al cliente, marque 2. ');
    if (enabled('employment_verification')) parts.push('Para verificación de empleo, marque 3. ');
    if (enabled('staff'))                   parts.push('Para personal, marque 4. ');
    if (enabled('emergency'))               parts.push('Para emergencias, marque 5. ');
    if (enabled('careers'))                 parts.push('Para carreras profesionales, marque 6. ');
    parts.push('Para verificar el estado de un caso de soporte, marque 7. ');
    parts.push('Para inglés, marque 9. Por favor, tome su tiempo.');

    return twiml(
      gather({ action: `${baseUrl}/api/voice/main-menu-route?lang=es`, numDigits: 1, timeout: 12 },
        say(parts.join(''), VOICE_ES, 'es-US')
      ) +
      redirect(`${baseUrl}/api/voice/main-menu-route?lang=es`)
    );
  }

  const parts: string[] = ['Hi, I\'m Trinity. I\'m here to help you. '];
  if (enabled('sales'))                   parts.push('For Sales, press 1. ');
  if (enabled('client_support'))          parts.push('For Client Support, press 2. ');
  if (enabled('employment_verification')) parts.push('For Employment Verification, press 3. ');
  if (enabled('staff'))                   parts.push('For Staff, press 4. ');
  if (enabled('emergency'))               parts.push('For Emergencies, press 5. ');
  if (enabled('careers'))                 parts.push('For Careers and Employment, press 6. ');
  parts.push('To check the status of a support case, press 7. ');
  parts.push('Para Español, marque 9. Please take your time.');

  return twiml(
    gather({ action: `${baseUrl}/api/voice/main-menu-route?lang=en`, numDigits: 1, timeout: 12 },
      say(parts.join(''))
    ) +
    redirect(`${baseUrl}/api/voice/main-menu-route?lang=en`)
  );
}

export function buildLanguageSelect(baseUrl: string): string {
  return twiml(
    gather({ action: `${baseUrl}/api/voice/language-select`, numDigits: 1, timeout: 10 },
      say('Hello, you\'ve reached Trinity. Press 1 for English, or Marque 2 para Español.')
    ) +
    redirect(`${baseUrl}/api/voice/language-select`)
  );
}

// ─── Call Session Management ──────────────────────────────────────────────────

export async function createCallSession(params: {
  workspaceId: string;
  twilioCallSid: string;
  phoneNumberId?: string;
  callerNumber?: string;
  language?: string;
}): Promise<VoiceCallSession> {
  const [session] = await db.insert(voiceCallSessions).values({
    workspaceId: params.workspaceId,
    twilioCallSid: params.twilioCallSid,
    phoneNumberId: params.phoneNumberId ?? null,
    callerNumber: params.callerNumber ?? null,
    status: 'in_progress',
    language: params.language ?? 'en',
    startedAt: new Date(),
  }).returning();

  return session;
}

export async function updateCallSession(
  twilioCallSid: string,
  updates: Partial<typeof voiceCallSessions.$inferInsert>,
): Promise<void> {
  await db.update(voiceCallSessions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(voiceCallSessions.twilioCallSid, twilioCallSid));
}

export async function logCallAction(params: {
  callSessionId: string;
  workspaceId: string;
  action: string;
  payload?: Record<string, unknown>;
  outcome?: string;
  errorMessage?: string;
}): Promise<void> {
  await db.insert(voiceCallActions).values({
    callSessionId: params.callSessionId,
    workspaceId: params.workspaceId,
    action: params.action,
    payload: params.payload ?? null,
    outcome: params.outcome ?? null,
    errorMessage: params.errorMessage ?? null,
    occurredAt: new Date(),
  }).catch((err) => log.warn('[voiceOrchestrator] Fire-and-forget failed:', err));
}

// ─── Usage Recording ──────────────────────────────────────────────────────────
// Records actual call cost on the call session for overage billing calculations.
// Under the flat-rate model there is no balance to debit — usage is simply logged.

export async function recordCallUsage(params: {
  workspaceId: string;
  callSessionId: string;
  durationSeconds: number;
  twilioCallSid: string;
  callerNumber?: string;
  outcome?: 'ai_resolved' | 'escalated' | 'abandoned' | 'voicemail';
  aiAttempted?: boolean;
  extensionHandled?: string;
}): Promise<{ minutes: number; costCents: number }> {
  const { durationSeconds, twilioCallSid } = params;

  const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
  const costCents = minutes * DEFAULT_COST_PER_MINUTE_CENTS;

  await updateCallSession(twilioCallSid, { actualCostCents: costCents });

  // Report call outcome to Trinity via the command bus (fire-and-forget)
  void trinityHelpaiCommandBus.reportVoiceCallOutcome({
    workspaceId: params.workspaceId,
    callSid: twilioCallSid,
    callerNumber: params.callerNumber || 'unknown',
    durationSeconds,
    outcome: params.outcome || 'abandoned',
    aiAttempted: params.aiAttempted ?? false,
    extensionHandled: params.extensionHandled,
  }).catch((err: any) => {
    log.warn('[VoiceOrchestrator] Command bus report failed (non-fatal):', err?.message);
  });

  return { minutes, costCents };
}

// ─── Handle Inbound ───────────────────────────────────────────────────────────

export async function handleInbound(params: {
  to: string;
  from: string;
  callSid: string;
  baseUrl: string;
}): Promise<string> {
  const { to, from, callSid, baseUrl } = params;

  // 1. Resolve workspace from the dialed number
  const workspace = await resolveWorkspaceFromPhoneNumber(to);

  if (!workspace) {
    log.warn(`[VoiceOrchestrator] Unknown phone number: ${to}`);
    return twiml(say('This number is not configured. Goodbye.'));
  }

  const { workspaceId, phoneRecord } = workspace;

  // 2. Create call session
  await createCallSession({
    workspaceId,
    twilioCallSid: callSid,
    phoneNumberId: phoneRecord.id,
    callerNumber: from,
    language: 'en',
  });

  // 3.5 Start call recording for ALL inbound calls so every session has a
  // recording URL and transcript available for review/audit (Phase 56 req).
  const recordingCallbackUrl = `${baseUrl}/api/voice/recording-done`;
  void (async () => {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (sid && token) {
        const twilio = (await import('twilio')).default;
        const client = twilio(sid, token);
        await client.calls(callSid).recordings.create({
          recordingStatusCallback: recordingCallbackUrl,
          recordingStatusCallbackMethod: 'POST',
        });
        log.info(`[VoiceOrchestrator] Recording started for call ${callSid}`);
      }
    } catch (err: any) {
      // Non-fatal — call proceeds even if recording fails (e.g. dev env with no Twilio creds)
      log.warn(`[VoiceOrchestrator] Could not start recording for ${callSid}: ${err.message}`);
    }
  })();

  // 4. Build greeting + language select
  const greetingEn = phoneRecord.greetingScript ||
    'Hello, thank you for calling. I\'m Trinity, your AI assistant. I\'m here to help.';

  return twiml(
    gather({ action: `${baseUrl}/api/voice/language-select`, numDigits: 1, timeout: 10 },
      say(greetingEn) +
      say('Press 1 for English, or Marque 2 para Español.')
    ) +
    redirect(`${baseUrl}/api/voice/language-select`)
  );
}

// ─── Semantic Aliases ─────────────────────────────────────────────────────────
// These provide the canonical named API for callers that use the documented
// orchestrator interface (identifyCaller, buildMainMenu) which map to the
// underlying implementations above.

/** Identify the workspace associated with the dialed phone number. */
export const identifyCaller = resolveWorkspaceFromPhoneNumber;

/** Build the main IVR menu for the given language and extension config. */
export const buildMainMenu = buildMainIVR;
