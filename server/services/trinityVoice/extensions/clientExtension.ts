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
 * Phase 25 — Client context enrichment.
 * Pulls the caller's client row + rollup stats for the resolved provider
 * workspace so Trinity's AI brain has real account context before answering.
 * Never throws — returns an empty context string if anything fails.
 */
async function fetchClientContext(params: {
  workspaceId: string;
  clientId?: string;
  callerPhone?: string;
}): Promise<string> {
  const { workspaceId, clientId, callerPhone } = params;
  if (!workspaceId) return '';
  if (!clientId && !callerPhone) return '';

  try {
    const { pool } = await import('../../../db');
    // Tenant-scoped lookup — WHERE clause always includes workspace_id (CLAUDE.md §G).
    const r = await pool.query(
      `SELECT c.id, c.company_name, c.first_name, c.last_name, c.client_number,
              COUNT(DISTINCT s.id) FILTER (
                WHERE s.status IN ('scheduled','confirmed','accepted','acknowledged')
                  AND s.start_time >= NOW()
              ) AS upcoming_shifts,
              COUNT(DISTINCT i.id) FILTER (
                WHERE i.status IN ('sent','overdue')
              ) AS open_invoices
         FROM clients c
         LEFT JOIN shifts s
           ON s.client_id = c.id AND s.workspace_id = $1
         LEFT JOIN invoices i
           ON i.client_id = c.id AND i.workspace_id = $1
        WHERE c.workspace_id = $1
          AND (
            ($2::text IS NOT NULL AND c.id = $2::text)
            OR ($3::text IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = regexp_replace($3::text, '[^0-9]', '', 'g'))
          )
        GROUP BY c.id, c.company_name, c.first_name, c.last_name, c.client_number
        LIMIT 1`,
      [workspaceId, clientId ?? null, callerPhone ?? null],
    );

    if (!r.rows[0]) return '';
    const row = r.rows[0];
    const displayName =
      row.company_name ||
      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() ||
      'Client';
    return (
      `Client: ${displayName}. ` +
      (row.client_number ? `Client number: ${row.client_number}. ` : '') +
      `${row.upcoming_shifts ?? 0} upcoming scheduled shifts. ` +
      `${row.open_invoices ?? 0} open invoices.`
    );
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
  callerPhone?: string;
  providerWorkspaceId?: string;
}): Promise<string> {
  try {
    const { sessionId, workspaceId, lang, baseUrl, clientId, callerPhone, providerWorkspaceId } = params;

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'extension_selected',
      payload: { extension: '2', label: 'client_support' },
      outcome: 'success',
    }).catch((err) => log.warn('[clientExtension] Fire-and-forget failed:', err));

    // Phase 25 — pull tenant-scoped client context for the caller.
    // If the caller was routed through /client-identify, we already know the
    // downstream provider workspace and can fetch their client row there.
    const contextWorkspaceId = providerWorkspaceId || workspaceId;
    const clientContext = await fetchClientContext({
      workspaceId: contextWorkspaceId,
      clientId,
      callerPhone,
    });

    const greeting = lang === 'es' ? getGatherIssuePhraseEs() : getGatherIssuePhraseEn();
    const contextParam = clientContext
      ? `&clientContext=${encodeURIComponent(clientContext.slice(0, 300))}`
      : '';
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
