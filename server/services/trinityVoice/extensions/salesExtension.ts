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
      say('Gracias por su interés. Un representante de ventas se comunicará con usted pronto. ' +
        'Por favor deje su nombre y número de teléfono después del tono, y nos pondremos en contacto en las próximas 24 horas.', 'es') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=es" maxLength="120" playBeep="true" />` +
      say('Gracias. Que tenga un buen día.', 'es')
    );
  }

  return twiml(
    say('Thank you for your interest in our security services. ' +
      'A sales representative will be in touch with you shortly. ' +
      'Please leave your name and phone number after the tone and we will contact you within 24 hours.') +
    `<Record action="${baseUrl}/api/voice/recording-done?ext=sales&lang=en" maxLength="120" playBeep="true" />` +
    say('Thank you. Have a great day.')
  );
}
