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
  try {
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
        say('¡Qué bueno que esté interesado en unirse a nuestro equipo! Co-League conecta a profesionales ' +
          'talentosos de seguridad con grandes organizaciones. Por favor deje su nombre, número de teléfono ' +
          'y el tipo de puesto que le interesa después del tono. Ya sea que sea un oficial con licencia, ' +
          'supervisor, o esté empezando una carrera en seguridad, queremos conocerle.', 'es') +
        `<Record action="${baseUrl}/api/voice/recording-done?ext=careers&lang=es" maxLength="120" playBeep="true" />` +
        say('Gracias. Nos pondremos en contacto con usted pronto.', 'es')
      );
    }

    return twiml(
      say('Awesome — you\'re interested in joining our team! Co-League connects talented security ' +
        'professionals with great organizations. Please leave your name, phone number, and the type ' +
        'of position you\'re interested in after the tone. Whether you\'re a licensed officer, ' +
        'supervisor, or looking to start a career in security, we want to hear from you!') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=careers&lang=en" maxLength="120" playBeep="true" />` +
      say('Thank you. We\'ll be in touch soon.')
    );
  } catch (err: any) {
    log.error('[careersExtension] Error:', err?.message);
    return twiml(say('We encountered an error. Please try again or press 0 to return to the main menu.'));
  }
}
