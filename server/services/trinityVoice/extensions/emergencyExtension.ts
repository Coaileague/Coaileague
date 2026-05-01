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
  try {
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
          say('Esta es la línea de Emergencias. Transfiriéndole con el supervisor de guardia ahora mismo. ' +
            'Si esto es una emergencia que pone en riesgo la vida, por favor cuelgue y llame al 9-1-1.', 'es') +
          `<Dial timeout="30" callerId="${onCallNumber}"><Number>${onCallNumber}</Number></Dial>` +
          say('No fue posible conectar con el supervisor de guardia. Por favor llame al 9-1-1 si es una emergencia que pone en riesgo la vida.', 'es')
        );
      }
      return twiml(
        say('Esta es la línea de Emergencias. Si esto es una emergencia que pone en riesgo la vida, ' +
          'por favor cuelgue y llame al 9-1-1 inmediatamente. Para incidentes urgentes de seguridad, ' +
          'emergencias de personal o verificaciones de bienestar de oficiales, por favor deje un mensaje ' +
          'detallado con su nombre, ubicación y la naturaleza de la situación. Su mensaje está siendo priorizado en este momento.', 'es') +
        `<Record maxLength="120" playBeep="true" />` +
        say('Su mensaje ha sido recibido. Un supervisor se comunicará con usted de inmediato.', 'es')
      );
    }

    if (onCallNumber) {
      return twiml(
        say('This is the Emergency line. Transferring you to the on-call supervisor now. ' +
          'If this is a life-threatening emergency, please hang up and call 9-1-1.') +
        `<Dial timeout="30"><Number>${onCallNumber}</Number></Dial>` +
        say('Unable to reach the on-call supervisor. Please call 9-1-1 if this is a life-threatening emergency.')
      );
    }

    return twiml(
      say('This is the Emergency line. If this is a life-threatening emergency, please hang up and call 9-1-1 immediately. ' +
        'For urgent security incidents, staffing emergencies, or officer welfare checks, please leave a detailed ' +
        'message with your name, location, and the nature of the situation. Your message is being prioritized right now.') +
      `<Record maxLength="120" playBeep="true" />` +
      say('Your message has been received. A supervisor will contact you immediately.')
    );
  } catch (err: unknown) {
    log.error('[emergencyExtension] Error:', err?.message);
    return twiml(say('We encountered an error. If this is a life-threatening emergency please hang up and call 9-1-1. Otherwise press 0 to return to the main menu.'));
  }
}
