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
      say('Ha seleccionado Verificación de Empleo. Por favor envíe su solicitud por escrito ' +
        'con el nombre completo del empleado, fechas de empleo y el propósito de la verificación ' +
        'a nuestra dirección de correo electrónico. Deje su nombre y número de contacto después del tono.', 'es') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=verify&lang=es" maxLength="120" playBeep="true" />` +
      say('Gracias por llamar.', 'es')
    );
  }

  return twiml(
    say('You have reached Employment Verification. Please submit your request in writing ' +
      'including the full name of the employee, dates of employment, and the purpose of the verification ' +
      'to our email address. Leave your name and contact number after the tone.') +
    `<Record action="${baseUrl}/api/voice/recording-done?ext=verify&lang=en" maxLength="120" playBeep="true" />` +
    say('Thank you for calling.')
  );
}
