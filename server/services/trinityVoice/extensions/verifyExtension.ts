/**
 * EMPLOYMENT VERIFICATION EXTENSION — Trinity Voice Phone System
 * Extension 3: Employment verification for background checks / reference calls
 *
 * LEGAL BOUNDARY (FCRA): Trinity confirms employment dates, title, status, pay
 * band, and officer readiness score + explanation link. Trinity never shares
 * exact salary, disciplinary details, termination reason, performance reviews,
 * or medical/personal information. All verifications require a signed
 * authorization form from the employee on file.
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

    const intro = lang === 'es'
      ? 'Ha llegado a Verificación de Empleo de Co-League. ' +
        'Para verificar el empleo de un trabajador, necesitamos su número de empleado de Co-League, ' +
        'que comienza con E-M-P guión. Si no tiene ese número, comuníquese directamente con el empleador. ' +
        'Por favor diga o ingrese el número de empleado ahora.'
      : 'You\'ve reached Co-League Employment Verification. ' +
        'To verify a worker\'s employment, please provide their Co-League employee ID number, ' +
        'which begins with E-M-P dash. If you don\'t have that number, please contact the employer directly. ' +
        'Please say or enter the employee ID number now.';

    const action = `${baseUrl}/api/voice/verify-employee-id?sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`;

    const fallback = lang === 'es'
      ? 'No escuché el número. Puede enviar su solicitud por correo electrónico a verificar arroba su organización punto coaileague punto com. Adiós.'
      : 'I did not receive the employee ID. You may submit a written request to verify at the employer\'s organization dot coaileague dot com. Goodbye.';

    return twiml(
      `<Gather input="speech dtmf" action="${action}" method="POST" timeout="12" speechTimeout="auto" hints="EMP,employee number,verification">` +
      say(intro, lang) +
      `</Gather>` +
      say(fallback, lang)
    );
  } catch (err: unknown) {
    log.error('[verifyExtension] Error:', err?.message);
    return twiml(say('We encountered an error. Please try again or press 0 to return to the main menu.'));
  }
}
