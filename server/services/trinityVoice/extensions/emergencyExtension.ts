/**
 * EMERGENCY EXTENSION — Trinity Voice Phone System
 * Extension 5: Emergency escalation — connects to on-call supervisor
 */

import { twiml, logCallAction } from '../voiceOrchestrator';
import { createLogger } from '../../../lib/logger';
const log = createLogger('emergencyExtension');


const say = (text: string, lang: 'en' | 'es' = 'en') =>
  lang === 'es'
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

export function handleEmergency(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  baseUrl: string;
  onCallNumber?: string;
}): string {
  const { sessionId, workspaceId, lang, onCallNumber } = params;

  logCallAction({
    callSessionId: sessionId,
    workspaceId,
    action: 'extension_selected',
    payload: { extension: '5', label: 'emergency' },
    outcome: 'success',
  }).catch((err) => log.warn('[emergencyExtension] Fire-and-forget failed:', err));

  if (lang === 'es') {
    if (onCallNumber) {
      return twiml(
        say('Emergencia recibida. Transfiriéndole con el supervisor de guardia ahora mismo.', 'es') +
        `<Dial timeout="30" callerId="${onCallNumber}"><Number>${onCallNumber}</Number></Dial>` +
        say('No fue posible conectar con el supervisor. Por favor llame al 9-1-1 si es una emergencia que pone en riesgo la vida.', 'es')
      );
    }
    return twiml(
      say('Ha seleccionado Emergencias. Si esto es una emergencia que pone en riesgo la vida, cuelgue y llame al 9-1-1. ' +
        'Por favor deje un mensaje detallado con su nombre, ubicación y la naturaleza de la emergencia.', 'es') +
      `<Record maxLength="120" playBeep="true" />` +
      say('Su mensaje ha sido recibido. Un supervisor se comunicará con usted de inmediato.', 'es')
    );
  }

  if (onCallNumber) {
    return twiml(
      say('Emergency received. Transferring you to the on-call supervisor now.') +
      `<Dial timeout="30"><Number>${onCallNumber}</Number></Dial>` +
      say('Unable to reach the on-call supervisor. Please call 9-1-1 if this is a life-threatening emergency.')
    );
  }

  return twiml(
    say('You have selected Emergencies. If this is a life-threatening emergency, please hang up and call 9-1-1. ' +
      'Please leave a detailed message with your name, location, and the nature of the emergency.') +
    `<Record maxLength="120" playBeep="true" />` +
    say('Your message has been received. A supervisor will contact you immediately.')
  );
}
