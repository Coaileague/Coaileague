/**
 * CLIENT SUPPORT EXTENSION — Trinity Voice Phone System (Phase 57 Upgrade)
 * ========================================================================
 * Extension 2: Full AI-powered customer support with human escalation.
 *
 * Call flow:
 *   Extension 2 selected
 *   → Trinity greets + gathers issue via speech
 *   → /api/voice/support-resolve: AI triad attempts resolution
 *   → If resolved → spoken answer → "Press 1 if resolved, Press 2 for human"
 *   → If not resolved / caller presses 2 → gather caller name
 *   → /api/voice/support-name-done → gather full issue message
 *   → /api/voice/support-create-case → create cause number → notify agents
 *   → Speak cause number to caller → goodbye
 */

import { twiml, logCallAction } from '../voiceOrchestrator';
import {
  getGatherIssuePhraseEn,
  getGatherIssuePhraseEs,
} from '../trinityAIResolver';
import { createLogger } from '../../../lib/logger';
const log = createLogger('clientExtension');


const sayEn = (text: string) =>
  `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

const sayEs = (text: string) =>
  `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`;

const say = (text: string, lang: 'en' | 'es') =>
  lang === 'es' ? sayEs(text) : sayEn(text);

function speechGather(opts: {
  action: string;
  timeout?: number;
  speechTimeout?: string;
  numDigits?: number;
  hints?: string;
}, children: string): string {
  const numDigitsAttr = opts.numDigits !== undefined ? ` numDigits="${opts.numDigits}"` : '';
  const hintsAttr = opts.hints ? ` hints="${opts.hints}"` : '';
  return `<Gather input="speech dtmf" action="${opts.action}" method="POST" timeout="${opts.timeout ?? 8}" speechTimeout="${opts.speechTimeout ?? 'auto'}"${numDigitsAttr}${hintsAttr}>${children}</Gather>`;
}

/**
 * Pull caller's client account context (company name, upcoming shifts, open invoices)
 * when we already know their clientId. Returns an empty string on any failure so
 * the call flow never blocks on this enrichment.
 */
export async function buildClientContext(workspaceId: string, clientId: string): Promise<string> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(`
      SELECT c.company_name, c.primary_contact_name,
             COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'scheduled' AND s.start_time >= NOW()) AS upcoming_shifts,
             COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('sent','overdue')) AS open_invoices
      FROM clients c
      LEFT JOIN shifts s ON s.client_id = c.id AND s.workspace_id = $1
      LEFT JOIN invoices i ON i.client_id = c.id AND i.workspace_id = $1
      WHERE c.id = $2 AND c.workspace_id = $1
      GROUP BY c.id, c.company_name, c.primary_contact_name
      LIMIT 1
    `, [workspaceId, clientId]);

    const row = r.rows[0];
    if (!row) return '';
    return `Client: ${row.company_name}. ` +
      `${row.upcoming_shifts ?? 0} upcoming scheduled shifts. ` +
      `${row.open_invoices ?? 0} open invoices.`;
  } catch (e: any) {
    log.warn('[clientExtension] Context enrichment failed (non-fatal):', e?.message);
    return '';
  }
}

export async function handleClientSupport(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  baseUrl: string;
  clientId?: string;
}): Promise<string> {
  try {
    const { sessionId, workspaceId, lang, baseUrl, clientId } = params;

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'extension_selected',
      payload: { extension: '2', label: 'client_support', clientId: clientId || null },
      outcome: 'success',
    }).catch((err) => log.warn('[clientExtension] Fire-and-forget failed:', err));

    let clientContext = '';
    if (clientId) {
      clientContext = await buildClientContext(workspaceId, clientId);
    }

    const contextParam = clientContext
      ? `&clientContext=${encodeURIComponent(clientContext.slice(0, 300))}`
      : '';

    const greeting = lang === 'es' ? getGatherIssuePhraseEs() : getGatherIssuePhraseEn();
    const action = `${baseUrl}/api/voice/support-resolve?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}${contextParam}`;

    return twiml(
      speechGather(
        { action, timeout: 10, speechTimeout: 'auto' },
        say(greeting, lang)
      ) +
      // No input timeout fallback
      say(
        lang === 'es'
          ? 'No escuché nada. Por favor llame de nuevo y describa su problema. Adiós.'
          : 'I did not hear anything. Please call back and describe your issue. Goodbye.',
        lang
      )
    );
  } catch (err: any) {
    log.error('[clientExtension] Error:', err?.message);
    return twiml(sayEn('We encountered an error. Please try again or press 0 to return to the main menu.'));
  }
}
