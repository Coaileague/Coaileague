/**
 * Trinity Outbound Call Service — Phase 18B
 * ==========================================
 * Allows Trinity to proactively call officers for:
 * - Pre-shift welfare checks
 * - Emergency escalations
 * - Shift confirmation calls
 * - Officer check-in callbacks
 *
 * Returns a Twilio call SID on success so the caller can correlate the call
 * back to a workflow record.
 */

import { createLogger } from '../../lib/logger';
import { isWorkspaceServiceable } from '../billing/billingConstants';
import { universalAudit } from '../universalAuditService';
const log = createLogger('trinityOutbound');

export interface OutboundCallParams {
  toPhone: string;
  fromPhone?: string;
  message: string;
  workspaceId: string;
  baseUrl: string;
  language?: 'en' | 'es';
}

export async function makeOutboundCall(params: OutboundCallParams): Promise<{
  success: boolean;
  callSid?: string;
  error?: string;
}> {
  const { toPhone, message, baseUrl, language, workspaceId } = params;
  const fromPhone = params.fromPhone || process.env.TWILIO_PHONE_NUMBER;

  // Phase 26: Subscription gate — never initiate outbound Trinity calls
  // for a workspace whose subscription is inactive. Protected workspaces
  // (platform, grandfathered) always pass.
  const serviceable = await isWorkspaceServiceable(workspaceId);
  if (!serviceable) {
    log.warn(`[TrinityOutbound] Subscription gate blocked outbound call for workspace ${workspaceId}`);
    try {
      await universalAudit.log({
        workspaceId,
        actorType: 'system',
        action: 'trinity.subscription_gate_blocked',
        entityType: 'voice_call',
        changeType: 'action',
        metadata: {
          channel: 'voice_outbound',
          reason: 'subscription_inactive',
          toPhone,
        },
      });
    } catch (auditErr: unknown) {
      log.warn('[TrinityOutbound] Gate audit failed (non-fatal):', auditErr?.message);
    }
    return { success: false, error: 'SUBSCRIPTION_INACTIVE' };
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken || !fromPhone) {
      return { success: false, error: 'Twilio not configured' };
    }

    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);

    const voice = language === 'es' ? 'Polly.Lupe-Neural' : 'Polly.Joanna-Neural';
    const lang = language === 'es' ? 'es-US' : 'en-US';
    const escapedMessage = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const followUpEn = 'Press 1 to confirm you received this message, or press 2 if you need assistance.';
    const followUpEs = 'Marque 1 para confirmar que recibió este mensaje, o marque 2 si necesita ayuda.';
    const followUp = language === 'es' ? followUpEs : followUpEn;

    const twimlBody = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${escapedMessage}</Say>
  <Pause length="1"/>
  <Gather numDigits="1" timeout="10" action="${baseUrl}/api/voice/outbound-callback?lang=${language || 'en'}" method="POST">
    <Say voice="${voice}" language="${lang}">${followUp}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">${language === 'es' ? 'No recibimos respuesta. Adiós.' : 'No response received. Goodbye.'}</Say>
</Response>`;

    const call = await client.calls.create({
      to: toPhone,
      from: fromPhone,
      twiml: twimlBody,
      statusCallback: `${baseUrl}/api/voice/status-callback`,
      statusCallbackMethod: 'POST',
    });

    log.info(`[TrinityOutbound] Call initiated to ${toPhone}, SID: ${call.sid}`);
    return { success: true, callSid: call.sid };
  } catch (err: unknown) {
    log.error('[TrinityOutbound] Call failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Convenience helper for pre-shift welfare checks. Looks up the officer's
 * phone and calls them with a personalized welfare-check message.
 */
export async function callOfficerWelfareCheck(params: {
  employeeId: string;
  workspaceId: string;
  baseUrl: string;
  shiftStartLabel?: string;
  language?: 'en' | 'es';
}): Promise<{ success: boolean; callSid?: string; error?: string }> {
  try {
    const { pool } = await import('../../db');
    const result = await pool.query(
      `SELECT first_name, phone FROM employees
        WHERE id = $1 AND workspace_id = $2 AND is_active = true
        LIMIT 1`,
      [params.employeeId, params.workspaceId]
    );
    if (!result.rows.length || !result.rows[0].phone) {
      return { success: false, error: 'Officer not found or has no phone number' };
    }

    const officer = result.rows[0];
    const start = params.shiftStartLabel || 'your upcoming shift';
    const message = params.language === 'es'
      ? `Hola ${officer.first_name}, soy Trinity de Co-League. Esta es una llamada de bienestar antes de ${start}. Solo queremos confirmar que está bien y listo.`
      : `Hi ${officer.first_name}, this is Trinity from Co-League. This is a welfare check before ${start}. We just want to confirm you're doing well and ready to go.`;

    return makeOutboundCall({
      toPhone: officer.phone,
      message,
      workspaceId: params.workspaceId,
      baseUrl: params.baseUrl,
      language: params.language,
    });
  } catch (err: unknown) {
    log.error('[TrinityOutbound] Welfare check error:', err.message);
    return { success: false, error: err.message };
  }
}
