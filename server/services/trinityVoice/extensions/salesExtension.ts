/**
 * SALES EXTENSION — Trinity Voice Phone System
 * Extension 1: Sales inquiries
 */

import { twiml, say as s, logCallAction } from '../voiceOrchestrator';
import { createLogger } from '../../../lib/logger';
const log = createLogger('salesExtension');


const say = (text: string, lang: 'en' | 'es' = 'en') =>
  lang === 'es'
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

export function handleSales(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  baseUrl: string;
}): string {
  try {
    const { sessionId, workspaceId, lang, baseUrl } = params;

    logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'extension_selected',
      payload: { extension: '1', label: 'sales' },
      outcome: 'success',
    }).catch((err) => log.warn('[salesExtension] Fire-and-forget failed:', err));

    // Phase 21 — present three choices before recording. Trinity asks whether
    // the caller wants voicemail, a live agent transfer, or a brief overview
    // of Co-League first. Default (no input) falls through to voicemail.
    const choiceAction = `${baseUrl}/api/voice/sales-choice?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;

    if (lang === 'es') {
      return twiml(
        `<Gather input="dtmf" action="${choiceAction}" method="POST" numDigits="1" timeout="12">` +
        say('¡Excelente! Ha llegado al equipo de ventas de Co-League. Nos encantaría conocer sus necesidades de seguridad. ' +
          'Marque 1 para dejar un mensaje de voz y le devolveremos la llamada dentro de un día hábil. ' +
          'Marque 2 para esperar a un representante de ventas en vivo. ' +
          'Marque 3 para conocer más sobre Co-League antes de hablar con alguien.', 'es') +
        `</Gather>` +
        // No input → record voicemail directly so the caller is never stranded
        say('Por favor deje su nombre, el mejor número para comunicarnos con usted, y una breve descripción de sus necesidades después del tono.', 'es') +
        `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=es" maxLength="120" playBeep="true" />` +
        say('Gracias. Que tenga un excelente día.', 'es')
      );
    }

    return twiml(
      `<Gather input="dtmf" action="${choiceAction}" method="POST" numDigits="1" timeout="12">` +
      say('Great! You\'ve reached Co-League sales. We\'d love to hear about your security needs. ' +
        'Press 1 to leave a voicemail and we\'ll call you back within one business day. ' +
        'Press 2 to wait for a live sales representative. ' +
        'Press 3 to learn more about Co-League before speaking with someone.') +
      `</Gather>` +
      // No input → record voicemail directly so the caller is never stranded
      say('Please leave your name, the best number to reach you, and a brief description of your needs after the tone.') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=en" maxLength="120" playBeep="true" />` +
      say('Thank you. Have a great day.')
    );
  } catch (err: any) {
    log.error('[salesExtension] Error:', err?.message);
    return twiml(s('We encountered an error. Please try again or press 0 to return to the main menu.'));
  }
}
