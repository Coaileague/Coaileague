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

    if (lang === 'es') {
      return twiml(
        say('¡Excelente! Ha llegado a nuestro equipo de ventas. Nos encantaría conocer sus necesidades de seguridad ' +
          'y mostrarle lo que Co-League puede hacer por su organización. Por favor deje su nombre, el mejor número ' +
          'para comunicarnos con usted, y una breve descripción de sus necesidades después del tono. ' +
          'Un miembro de nuestro equipo se comunicará con usted dentro de un día hábil.', 'es') +
        `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=es" maxLength="120" playBeep="true" />` +
        say('Gracias. Que tenga un excelente día.', 'es')
      );
    }

    return twiml(
      say('Great! You\'ve reached our sales team. We\'d love to learn about your security needs ' +
        'and show you what Co-League can do for your organization. Please leave your name, the best ' +
        'number to reach you, and a brief description of your needs after the tone. ' +
        'A member of our team will reach out within one business day.') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=en" maxLength="120" playBeep="true" />` +
      say('Thank you. Have a great day.')
    );
  } catch (err: any) {
    log.error('[salesExtension] Error:', err?.message);
    return twiml(s('We encountered an error. Please try again or press 0 to return to the main menu.'));
  }
}
