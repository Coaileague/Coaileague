/**
 * TRANSFER EXTENSION — Trinity Voice Phone System
 * Handles warm transfers to live agents / supervisors
 */

import { twiml, logCallAction } from '../voiceOrchestrator';
import { createLogger } from '../../../lib/logger';
const log = createLogger('transferExtension');


const say = (text: string, lang: 'en' | 'es' = 'en') =>
  lang === 'es'
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

export function handleTransfer(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  transferTo: string;
  reason?: string;
}): string {
  const { sessionId, workspaceId, lang, transferTo, reason } = params;

  logCallAction({
    callSessionId: sessionId,
    workspaceId,
    action: 'transfer',
    payload: { transferTo, reason },
    outcome: 'initiated',
  }).catch((err) => log.warn('[transferExtension] Fire-and-forget failed:', err));

  const connectingMsg = lang === 'es'
    ? 'Conectando con un agente ahora mismo. Por favor espere.'
    : 'Connecting you to an agent now. Please hold.';
  const failMsg = lang === 'es'
    ? 'Lo sentimos, no fue posible conectar con un agente en este momento. Por favor llame nuevamente o deje un mensaje.'
    : 'We were unable to connect you with an agent at this time. Please call back or leave a message.';

  return twiml(
    say(connectingMsg, lang) +
    `<Dial timeout="30" callerId="${transferTo}"><Number>${transferTo}</Number></Dial>` +
    say(failMsg, lang)
  );
}
