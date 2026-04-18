/**
 * EMPLOYMENT VERIFICATION EXTENSION — Trinity Voice Phone System
 * Extension 3: Employment verification for background checks / reference calls
 */

import { twiml, logCallAction } from '../voiceOrchestrator';
import { createLogger } from '../../../lib/logger';
const log = createLogger('verifyExtension');


const say = (text: string, lang: 'en' | 'es' = 'en') =>
  lang === 'es'
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

export function handleEmploymentVerification(params: {
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
      payload: { extension: '3', label: 'employment_verification' },
      outcome: 'success',
    }).catch((err) => log.warn('[verifyExtension] Fire-and-forget failed:', err));

    if (lang === 'es') {
      return twiml(
        say('Ha llegado al área de Verificación de Empleo. Para proteger la privacidad de nuestros empleados, ' +
          'todas las solicitudes de verificación deben enviarse por escrito. Por favor deje su nombre, su organización, ' +
          'el nombre completo del empleado, las fechas de empleo a verificar, y su número de devolución de llamada. ' +
          'Respondemos a las solicitudes de verificación dentro de dos días hábiles.', 'es') +
        `<Record action="${baseUrl}/api/voice/recording-done?ext=verify&lang=es" maxLength="120" playBeep="true" />` +
        say('Gracias por llamar.', 'es')
      );
    }

    return twiml(
      say('You\'ve reached Employment Verification. To protect our employees\' privacy, all verification ' +
        'requests must be submitted in writing. Please leave your name, your organization, the employee\'s ' +
        'full name, the dates of employment you need verified, and your callback number. ' +
        'We respond to verification requests within two business days.') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=verify&lang=en" maxLength="120" playBeep="true" />` +
      say('Thank you for calling.')
    );
  } catch (err: any) {
    log.error('[verifyExtension] Error:', err?.message);
    return twiml(say('We encountered an error. Please try again or press 0 to return to the main menu.'));
  }
}
