/**
 * CAREERS EXTENSION — Trinity Voice Phone System
 * Extension 6: Job inquiries / employment applications
 */

import { twiml, logCallAction } from '../voiceOrchestrator';
import { createLogger } from '../../../lib/logger';
const log = createLogger('careersExtension');


const say = (text: string, lang: 'en' | 'es' = 'en') =>
  lang === 'es'
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

export function handleCareers(params: {
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
    payload: { extension: '6', label: 'careers' },
    outcome: 'success',
  }).catch((err) => log.warn('[careersExtension] Fire-and-forget failed:', err));

  if (lang === 'es') {
    return twiml(
      say('Gracias por su interés en unirse a nuestro equipo. Somos una empresa de seguridad en crecimiento ' +
        'que siempre busca profesionales dedicados. Por favor deje su nombre, número de teléfono y el puesto ' +
        'que le interesa después del tono. También puede visitar nuestro sitio web para ver las vacantes disponibles.', 'es') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=careers&lang=es" maxLength="120" playBeep="true" />` +
      say('Gracias por su interés. Nos comunicaremos con usted pronto.', 'es')
    );
  }

  return twiml(
    say('Thank you for your interest in joining our team. We are a growing security company ' +
      'always looking for dedicated professionals. Please leave your name, phone number, and the position ' +
      'you are interested in after the tone. You may also visit our website to view available openings.') +
    `<Record action="${baseUrl}/api/voice/recording-done?ext=careers&lang=en" maxLength="120" playBeep="true" />` +
    say('Thank you for your interest. We will be in touch soon.')
  );
}
