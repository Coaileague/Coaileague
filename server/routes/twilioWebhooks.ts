/**
 * Twilio Inbound SMS Webhook
 * Handles inbound SMS replies: STOP/HELP opt-out keywords + shift offer acceptances
 *
 * Twilio calls this endpoint when an SMS reply arrives on the registered number.
 * POST /api/webhooks/twilio/sms
 * Body (form-urlencoded): From, Body, To, MessageSid
 *
 * CTIA / Twilio Carrier Compliance:
 *   STOP / STOPALL / CANCEL / END / QUIT / UNSUBSCRIBE → opt-out confirmation
 *   HELP → program description + opt-out instruction
 *   YES / YES <name> → shift offer acceptance
 */
import { Router, Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { db } from '../db';
import { employees, notifications, workspaces, smsConsent, interviewCandidates, candidateInterviewSessions } from '@shared/schema';
import { eq, ilike, and } from 'drizzle-orm';
import { generateComprehensiveScorecard } from '../services/recruitment/scorecardService';
import { sendSMS } from '../services/smsService'; // infra
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { PLATFORM } from '../config/platformConfig';
import { z } from 'zod';
const log = createLogger('TwilioWebhooks');

// ── Twilio Signature Validation Middleware ────────────────────────────────────
// Guards the voice-interview webhook routes from unauthenticated callers.
// SECURITY: Fails-closed in production when TWILIO_AUTH_TOKEN is not configured.
// Bypassed in non-production environments to allow local dev/test without Twilio.
function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    if (process.env.NODE_ENV === 'production') {
      // FAIL-CLOSED: Reject all Twilio webhook calls in production without a
      // configured auth token — no token means no verification, which means any
      // caller could spoof SMS opt-out, shift acceptance, or interview events.
      log.error('[TwilioWebhooks] TWILIO_AUTH_TOKEN not configured in production — rejecting request to prevent unauthenticated webhook processing');
      res.status(503).json({ error: 'Webhook endpoint not ready — configuration error' });
      return;
    }
    // Non-production: skip validation to allow dev/test without a Twilio account
    log.warn('[TwilioWebhooks] TWILIO_AUTH_TOKEN not set — skipping signature validation (non-production only)');
    next();
    return;
  }
  const isValid = twilio.validateExpressRequest(req, authToken, { protocol: 'https' });
  if (!isValid) {
    log.warn('[TwilioWebhooks] Rejected request with invalid Twilio signature');
    res.status(403).json({ error: 'Forbidden — invalid Twilio signature' });
    return;
  }
  next();
}

const router = Router();

// ── CTIA-compliant opt-out keywords (must respond to all of these) ────────────
const OPT_OUT_KEYWORDS = new Set([
  'STOP', 'STOPALL', 'CANCEL', 'END', 'QUIT', 'UNSUBSCRIBE',
]);

// ── CTIA-compliant re-opt-in keywords ────────────────────────────────────────
// Carriers automatically restore delivery on UNSTOP/START; we must also restore
// our own consent record so our application-level consent gate allows messages.
const OPT_IN_KEYWORDS = new Set(['UNSTOP', 'START', 'RESUME']);

// ── CTIA-compliant help keywords ─────────────────────────────────────────────
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^1/, '');
}

function parseYesReply(body: string): { accepted: boolean; name?: string } {
  const trimmed = body.trim();
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('YES')) return { accepted: false };
  const rest = trimmed.slice(3).trim();
  return { accepted: true, name: rest || undefined };
}

// Bilingual decline detection — NO, NO GRACIAS, DECLINE, RECHAZAR, NOPE
const DECLINE_KEYWORDS = new Set([
  'NO', 'NO GRACIAS', 'DECLINE', 'RECHAZAR', 'NOPE', 'CANT', 'CANNOT',
  'NO PUEDO', 'NO PUEDO IR', 'UNABLE', 'PASS', 'SKIP',
]);
function parseNoReply(body: string): { declined: boolean } {
  const upper = body.trim().toUpperCase();
  // Exact match first
  if (DECLINE_KEYWORDS.has(upper)) return { declined: true };
  // Starts-with check for "NO GRACIAS ..." etc.
  for (const kw of DECLINE_KEYWORDS) {
    if (upper.startsWith(kw + ' ') || upper.startsWith(kw + ',')) return { declined: true };
  }
  return { declined: false };
}

async function replySms(to: string, body: string, workspaceId?: string) {
  return sendSMS({ to, body, workspaceId, type: 'shift_offer_reply' }); // infra
}

/**
 * Restore SMS consent for a phone number that previously opted out.
 * Triggered by UNSTOP, START, or RESUME keyword per CTIA re-opt-in guidelines.
 * Carriers automatically restore message delivery; we sync our DB consent record.
 */
async function handleReOptIn(fromPhone: string): Promise<void> {
  try {
    const normalizedPhone = normalizePhone(fromPhone);

    const existing = await db.query.smsConsent.findFirst({
      where: eq(smsConsent.phoneNumber, normalizedPhone),
    });

    if (existing) {
      await db
        .update(smsConsent)
        .set({
          consentGiven: true,
          optOutAt: null,
          optOutMethod: null,
        })
        .where(eq(smsConsent.phoneNumber, normalizedPhone));
      log.info(`[TwilioSMS] Re-opt-in restored for ${normalizedPhone}`);
    } else {
      // Number opted out at carrier level but not in our DB — log only.
      log.info(`[TwilioSMS] Re-opt-in from unknown number ${normalizedPhone} — no consent record to update`);
    }
  } catch (err) {
    log.error('[TwilioSMS] Failed to record re-opt-in:', err);
  }
}

/**
 * Mark a phone number as opted out in smsConsent.
 * Updates any existing consent record(s) for this phone number.
 * If no record exists (unknown number), logs the opt-out only —
 * Twilio's carrier-level STOP handling ensures no further messages are sent.
 */
async function handleOptOut(fromPhone: string): Promise<void> {
  try {
    const normalizedPhone = normalizePhone(fromPhone);

    // Find existing consent record by phone number
    const existing = await db.query.smsConsent.findFirst({
      where: eq(smsConsent.phoneNumber, normalizedPhone),
    });

    if (existing) {
      await db
        .update(smsConsent)
        .set({
          optOutAt: new Date(),
          optOutMethod: 'reply_stop',
          consentGiven: false,
        })
        .where(eq(smsConsent.phoneNumber, normalizedPhone));
      log.info(`[TwilioSMS] Opt-out recorded for ${normalizedPhone}`);
    } else {
      // Number not in our system — log only. Twilio's carrier-level STOP block
      // prevents further messages regardless of our database state.
      log.info(`[TwilioSMS] STOP received from unknown number ${normalizedPhone} — no consent record to update`);
    }
  } catch (err) {
    log.error('[TwilioSMS] Failed to record opt-out:', err);
  }
}

router.post('/api/webhooks/twilio/sms', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const from: string = req.body?.From || '';
    const body: string = req.body?.Body || '';
    const messageSid: string = req.body?.MessageSid || '';

    log.info(`[TwilioSMS] Inbound from ${from}: "${body}" (SID: ${messageSid})`);

    const keyword = body.trim().toUpperCase();

    // ── CTIA STOP / opt-out handling ─────────────────────────────────────────
    // Must respond with EXACTLY this format per CTIA guidelines.
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      await handleOptOut(from);

      // CTIA-required opt-out confirmation — must NOT include marketing content
      const stopConfirmation =
        `You have been unsubscribed from ${PLATFORM.name} Workforce Alerts. ` +
        'You will receive no further messages from this number. ' +
        `To re-enroll, update your notification preferences in the ${PLATFORM.name} app.`;

      res.set('Content-Type', 'text/xml');
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${stopConfirmation}</Message></Response>`,
      );
    }

    // ── CTIA re-opt-in handling (UNSTOP / START / RESUME) ────────────────────
    // Users who previously texted STOP can re-subscribe. We sync our consent
    // record to match the carrier's restored delivery state.
    if (OPT_IN_KEYWORDS.has(keyword)) {
      await handleReOptIn(from);

      const reOptInConfirmation =
        `You have been re-subscribed to ${PLATFORM.name} Workforce Alerts. ` +
        'Msg frequency varies. Msg & data rates may apply. ' +
        'Reply STOP to unsubscribe at any time. Reply HELP for help.';

      res.set('Content-Type', 'text/xml');
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reOptInConfirmation}</Message></Response>`,
      );
    }

    // ── CTIA HELP / INFO handling ─────────────────────────────────────────────
    // Must respond with program description + opt-out instruction.
    if (HELP_KEYWORDS.has(keyword)) {
      const helpResponse =
        `${PLATFORM.name} Workforce Alerts: Shift reminders, schedule updates, safety alerts, and account notifications for security staff. ` +
        'Msg frequency varies. Msg & data rates may apply. ' +
        'Reply STOP to unsubscribe. Contact support@coaileague.com for help.';

      res.set('Content-Type', 'text/xml');
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${helpResponse}</Message></Response>`,
      );
    }

    const parsed = parseYesReply(body);
    const parsedDecline = parseNoReply(body);

    // Respond immediately with empty TwiML so Twilio doesn't time out
    const emptyTwiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

    // ── Shift offer DECLINE (NO / NO GRACIAS / DECLINE / RECHAZAR) ────────────
    if (parsedDecline.declined) {
      res.set('Content-Type', 'text/xml');
      res.send(emptyTwiml);

      scheduleNonBlocking('twilio.inbound-sms-decline', async () => {
        try {
          const normalizedFrom = normalizePhone(from);
          const { detectLanguage } = await import('../services/trinityVoice/smsLanguageDetector');
          const lang = detectLanguage(body);
          const t = (en: string, es: string) => lang === 'es' ? es : en;

          const allEmployeesDecline = await db.select().from(employees);
          const matchedEmpDecline = allEmployeesDecline.find(e =>
            e.phone && normalizePhone(e.phone) === normalizedFrom
          );

          if (!matchedEmpDecline) {
            await sendSMS({
              to: from,
              body: t(
                "We couldn't find your account. No shift offer was declined.",
                "No encontramos tu cuenta. No se rechazó ninguna oferta de turno."
              ),
              type: 'shift_offer_reply',
            }).catch(() => null);
            return;
          }

          const wsId = matchedEmpDecline.workspaceId;
          const ws = wsId ? await db.query.workspaces?.findFirst?.({ where: eq(workspaces.id, wsId) }) : null;
          const orgName = (ws as any)?.name || 'CoAIleague';

          // Find pending offer notification
          const pendingOffers = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.recipientUserId, matchedEmpDecline.userId || ''),
                eq(notifications.type, 'coverage_offer' as any),
              )
            );

          const offerNotif = pendingOffers.find(n => {
            const meta = (n as any).metadata || {};
            return meta.status !== 'accepted' && meta.status !== 'declined' && !meta.declined;
          });

          if (!offerNotif) {
            await sendSMS({
              to: from,
              body: t(
                `${orgName}: No pending shift offer found for your account.`,
                `${orgName}: No encontramos ninguna oferta de turno pendiente para tu cuenta.`
              ),
              workspaceId: wsId,
              type: 'shift_offer_reply',
            }).catch(() => null);
            return;
          }

          // Mark as declined
          const currentMeta = (offerNotif as any).metadata || {};
          await db.update(notifications)
            .set({ metadata: { ...currentMeta, status: 'declined', declinedAt: new Date().toISOString(), declinedVia: 'sms' } } as any)
            .where(eq(notifications.id, offerNotif.id));

          platformEventBus.emit('shift_offer_declined', {
            employeeId: matchedEmpDecline.id,
            workspaceId: wsId,
            shiftId: offerNotif.relatedEntityId,
            notificationId: offerNotif.id,
            via: 'sms',
          });

          await sendSMS({
            to: from,
            body: t(
              `${orgName}: Got it — you've declined this shift offer. Trinity will continue searching for coverage.`,
              `${orgName}: Entendido — rechazaste esta oferta de turno. Trinity continuará buscando cobertura.`
            ),
            workspaceId: wsId,
            type: 'shift_offer_reply',
          }).catch(() => null);

          log.info(`[TwilioSMS] Employee ${matchedEmpDecline.id} DECLINED offer ${offerNotif.relatedEntityId} via SMS`);
        } catch (err: unknown) {
          log.warn('[TwilioSMS] Decline handler error:', err?.message);
        }
      });
      return;
    }

    if (!parsed.accepted) {
      // ── Trinity SMS Auto-Resolution ──────────────────────────────────────
      // Any free-form message that isn't a keyword or shift acceptance gets
      // routed through Trinity's 4-tier resolution pipeline. Reply arrives
      // within 10-20 seconds (usually 3-5 seconds on FAQ/instant path).
      res.set('Content-Type', 'text/xml');
      res.send(emptyTwiml); // Acknowledge Twilio immediately

      scheduleNonBlocking('twilio.inbound-sms-trinity-triage', async () => {
        try {
          const { resolveInboundSms } = await import('../services/trinityVoice/smsAutoResolver');
          const result = await resolveInboundSms({ fromPhone: from, message: body });
          // Send the reply back to the sender
          await sendSMS({ to: from, body: result.reply, workspaceId: result.workspaceId, type: 'system_alert' });
          log.info(`[TrinitySmsTriage] ${result.method} resolution for ${from} — resolved=${result.resolved}`);
        } catch (err: unknown) {
          log.warn(`[TrinitySmsTriage] Auto-resolver error for ${from}:`, err?.message);
          // Fallback reply so caller isn't left hanging
          await sendSMS({
            to: from,
            body: 'Hi! Trinity here. We received your message and a support specialist will follow up with you shortly.',
            type: 'system_alert',
          }).catch((sendErr: any) => {
            log.warn('[TwilioWebhooks] Fallback SMS send failed (non-critical)', { error: sendErr?.message });
          });
        }
      });
      return;
    }

    const normalizedFrom = normalizePhone(from);

    // Match employee by phone number
    const allEmployees = await db.select().from(employees);
    const matchedEmployee = allEmployees.find(e => {
      if (!e.phone) return false;
      return normalizePhone(e.phone) === normalizedFrom;
    });

    if (!matchedEmployee) {
      log.info(`[TwilioSMS] No employee found for incoming SMS (phone masked)`);
      await replySms(from, "We couldn't find your account. Please contact your manager to accept your shift offer.");
      res.set('Content-Type', 'text/xml');
      return res.send(emptyTwiml);
    }

    const workspaceId = matchedEmployee.workspaceId;

    // Find pending coverage_offer notification for this employee
    const allNotifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.type, 'coverage_offer' as any),
        ),
      );

    const offerNotif = allNotifs.find(n => {
      const meta = (n as any).metadata || {};
      return !meta.accepted && !meta.declined && n.userId === matchedEmployee.userId;
    });

    // Get workspace name for SMS reply
    const [workspace] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const orgName = workspace?.name || 'Your organization';

    if (offerNotif) {
      const currentMeta = (offerNotif as any).metadata || {};

      if (currentMeta.accepted) {
        await replySms(from, `${orgName}: Your shift offer has already been accepted. See the app for details.`, workspaceId);
        res.set('Content-Type', 'text/xml');
        return res.send(emptyTwiml);
      }

      // Mark accepted
      await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
          metadata: {
            ...currentMeta,
            accepted: true,
            acceptedAt: new Date().toISOString(),
            acceptedViaSms: true,
            smsFrom: from,
            smsNameProvided: parsed.name,
          },
        })
        .where(eq(notifications.id, offerNotif.id));

      const location  = currentMeta.location  || 'the assigned location';
      const date      = currentMeta.date      || 'the scheduled date';
      const startTime = currentMeta.startTime || '';
      const endTime   = currentMeta.endTime   || '';
      const timeRange = startTime && endTime ? ` from ${startTime} to ${endTime}` : '';

      await replySms(
        from,
        `${orgName}: Shift accepted! You're confirmed for ${location} on ${date}${timeRange}. Your manager will follow up with full details. Thank you!`,
        workspaceId,
      );

      log.info(`[TwilioSMS] Employee ${matchedEmployee.id} accepted offer ${offerNotif.relatedEntityId} via SMS`);

      platformEventBus.publish({
        type: 'shift_updated',
        category: 'feature',
        title: 'Shift accepted via SMS',
        description: `Officer ${matchedEmployee.firstName || ''} ${matchedEmployee.lastName || ''} accepted a shift offer via SMS reply.`,
        workspaceId,
        metadata: {
          employeeId: matchedEmployee.id,
          notificationId: offerNotif.id,
          shiftId: offerNotif.relatedEntityId,
          method: 'sms',
          acceptedAt: new Date().toISOString(),
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    } else {
      await replySms(
        from,
        `${orgName}: We received your YES but couldn't find an open shift offer for your account. Contact your manager for assistance.`,
        workspaceId,
      );
      log.info(`[TwilioSMS] No pending coverage_offer for employee ${matchedEmployee.id} in workspace ${workspaceId}`);
    }

    res.set('Content-Type', 'text/xml');
    return res.send(emptyTwiml);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('[TwilioSMS] Webhook error:', err.message);
    const { monitoringService } = await import('../monitoring');
    monitoringService.logError(err, {
      requestId: req.requestId,
      severity: 'error',
      additionalData: { path: req.path, method: req.method }
    });
    res.set('Content-Type', 'text/xml');
    return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE INTERVIEW — Phase 58 / Phase 56 Extension 6
//
// Structured voice interview via Twilio Gather + Trinity AI scoring.
//
// Endpoints (all public — Twilio doesn't send auth headers for voice):
//   POST /api/webhooks/twilio/voice-interview/start   — initial inbound call
//   GET  /api/webhooks/twilio/voice-interview/question — read next question
//   POST /api/webhooks/twilio/voice-interview/response — score speech response
//   POST /api/webhooks/twilio/voice-interview/recording — recording callback
// ─────────────────────────────────────────────────────────────────────────────
function getWebhookBase(): string {
  return process.env.APP_BASE_URL

    || 'https://www.coaileague.com';
}

/**
 * POST /api/webhooks/twilio/voice-interview/start
 * Called by Twilio when an inbound call is received on the interview number.
 * Looks up the candidate by CallerId (phone number) and delivers Q1.
 */
router.post('/api/webhooks/twilio/voice-interview/start', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const callerPhone = (req.body?.From || '').replace(/\D/g, '').replace(/^1/, '');
    log.info(`[VoiceInterview] Inbound call from ${callerPhone}`);

    res.set('Content-Type', 'text/xml');

    if (!callerPhone) {
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Joanna">We could not identify your phone number. Please contact the recruitment team directly. Goodbye.</Say><Hangup/></Response>`);
    }

    // Look up candidate by phone number
    const [candidate] = await db.select()
      .from(interviewCandidates)
      .where(eq(interviewCandidates.phone, callerPhone))
      .limit(1);

    if (!candidate || !(candidate as any).voiceSessionId) {
      // No pending voice session — could be a careers inbound call
      const sessionIdFromQuery = req.query.sessionId as string | undefined;
      if (!sessionIdFromQuery) {
        return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Joanna">Welcome to the recruitment line. We do not have a scheduled voice interview for this number. Please check your invitation email. Goodbye.</Say><Hangup/></Response>`);
      }
    }

    const sessionId = (candidate as any)?.voiceSessionId || (req.query.sessionId as string);
    const workspaceId = candidate?.workspaceId || (req.query.workspaceId as string);
    const base = getWebhookBase();

    // Redirect to question 0
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="GET">${base}/api/webhooks/twilio/voice-interview/question?sessionId=${encodeURIComponent(sessionId)}&amp;workspaceId=${encodeURIComponent(workspaceId)}&amp;qIndex=0</Redirect>
</Response>`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[VoiceInterview] Start error:', msg);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We encountered a technical issue. Please try again later.</Say><Hangup/></Response>`);
  }
});

/**
 * GET /api/webhooks/twilio/voice-interview/question
 * Reads the question at qIndex and sets up a Gather for the response.
 */
router.get('/api/webhooks/twilio/voice-interview/question', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const workspaceId = req.query.workspaceId as string;
    const qIndex = parseInt((req.query.qIndex as string) || '0', 10);

    res.set('Content-Type', 'text/xml');

    if (!sessionId || !workspaceId) {
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Interview session not found. Goodbye.</Say><Hangup/></Response>`);
    }

    const state = await getVoiceSessionState(sessionId, workspaceId);
    if (!state || qIndex >= state.questions.length) {
      // Interview complete
      const [session] = await db.select({ sessionScore: candidateInterviewSessions.sessionScore })
        .from(candidateInterviewSessions)
        .where(eq(candidateInterviewSessions.id, sessionId))
        .limit(1);
      return res.send(buildClosingTwiml(session?.sessionScore ?? 0));
    }

    const question = state.questions[qIndex];
    const base = getWebhookBase();
    return res.send(buildQuestionTwiml(sessionId, workspaceId, qIndex, question.questionText, base));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[VoiceInterview] Question error:', msg);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We encountered a technical issue. Goodbye.</Say><Hangup/></Response>`);
  }
});

/**
 * POST /api/webhooks/twilio/voice-interview/response
 * Twilio posts SpeechResult here after each Gather.
 * Scores the response and advances to the next question.
 */
router.post('/api/webhooks/twilio/voice-interview/response', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const sessionId = req.body.sessionId || (req.query.sessionId as string);
    const workspaceId = req.body.workspaceId || (req.query.workspaceId as string);
    const speechResult: string = req.body.SpeechResult || '';
    const qIndex = parseInt(req.body.qIndex || req.query.qIndex as string || '0', 10);

    log.info(`[VoiceInterview] Response Q${qIndex} session=${sessionId}: "${speechResult.slice(0, 80)}..."`);

    res.set('Content-Type', 'text/xml');

    if (!sessionId || !workspaceId) {
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Session error. Goodbye.</Say><Hangup/></Response>`);
    }

    const { nextQuestionIndex, sessionScore, candidateId } = await scoreSpeechResponse(
      sessionId,
      workspaceId,
      qIndex,
      speechResult,
    );

    const base = getWebhookBase();

    if (nextQuestionIndex !== null) {
      // Advance to next question
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="GET">${base}/api/webhooks/twilio/voice-interview/question?sessionId=${encodeURIComponent(sessionId)}&amp;workspaceId=${encodeURIComponent(workspaceId)}&amp;qIndex=${nextQuestionIndex}</Redirect>
</Response>`);
    } else {
      // All questions answered — persist comprehensive scorecard before ending the call
      if (candidateId) {
        generateComprehensiveScorecard(candidateId, workspaceId).catch((err: Error) =>
          log.error('[VoiceInterview] Scorecard generation failed:', err.message),
        );
      }
      return res.send(buildClosingTwiml(sessionScore));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? (err as Error).message : String(err);
    log.error('[VoiceInterview] Response error:', msg);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We encountered an error. Goodbye.</Say><Hangup/></Response>`);
  }
});

/**
 * POST /api/webhooks/twilio/voice-interview/recording
 * Twilio posts the recording URL when it is ready.
 * Persists the URL and transcript to the session.
 */
router.post('/api/webhooks/twilio/voice-interview/recording', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const recordingUrl: string = req.body.RecordingUrl || '';
    const transcriptionText: string = req.body.TranscriptionText || '';
    const sessionId = req.query.sessionId as string;
    const workspaceId = req.query.workspaceId as string;

    log.info(`[VoiceInterview] Recording callback — sessionId=${sessionId}`);

    if (sessionId && workspaceId && recordingUrl) {
      await db.update(candidateInterviewSessions)
        .set({
          voiceRecordingUrl: recordingUrl,
          voiceTranscript: transcriptionText || null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(candidateInterviewSessions.id, sessionId),
          eq(candidateInterviewSessions.workspaceId, workspaceId),
        ));
    }

    res.status(204).send();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[VoiceInterview] Recording callback error:', msg);
    res.status(204).send();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS CALLBACK — Twilio delivery receipts for outbound messages
// Twilio POSTs here when a message is delivered, failed, undelivered, etc.
// POST /api/webhooks/twilio/status
// Body (form-urlencoded): MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/webhooks/twilio/status', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const messageSid: string    = req.body?.MessageSid    || '';
    const messageStatus: string = req.body?.MessageStatus || '';
    const to: string            = req.body?.To            || '';
    const from: string          = req.body?.From          || '';
    const errorCode: string     = req.body?.ErrorCode     || '';
    const errorMessage: string  = req.body?.ErrorMessage  || '';

    log.info(`[TwilioStatus] SID=${messageSid} | Status=${messageStatus} | To=${to} | Error=${errorCode || 'none'}`);

    if (errorCode) {
      log.warn(`[TwilioStatus] Delivery failure — ErrorCode=${errorCode}: ${errorMessage}`);
    }

    // Twilio expects a 204 No Content on status callbacks
    res.status(204).send();
  } catch (error: unknown) {
    log.error('[TwilioStatus] Callback error:', error);
    res.status(204).send();
  }
});

export default router;
