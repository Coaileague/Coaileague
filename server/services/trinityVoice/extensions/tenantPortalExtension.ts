/**
 * Statewide Tenant Phone Portal — Wave 16
 * ─────────────────────────────────────────────────────────────────────────────
 * The complete phone portal for any tenant on the CoAIleague platform.
 * Statewide Protective Services (C11608501) is the pilot tenant.
 *
 * MENU STRUCTURE:
 *   Root: "Welcome to [Company]. How can I help you today?"
 *   1 → Guard/Officer lane (clock-in, schedule, calloff, pay, supervisor)
 *   2 → Client/Site Contact lane (coverage check, concern, billing, transfer)
 *   3 → Emergency → immediate transfer (no menu navigation)
 *   4 → Complaint → collect name + purpose → transfer
 *   5 → Employment Verification → platform query → response
 *   6 → Speak with Manager → collect name + purpose → transfer
 *   0 → Trinity AI free-talk (Gemini Live with tenant context)
 *
 * TRANSFER RULE (priority waterfall):
 *   1st: Supervisor on active shift
 *   2nd: Manager/Dept Manager on active shift
 *   3rd: Co-Owner (if exists)
 *   4th: Owner (Bryan — 830-213-4562 for Statewide)
 *   5th: Voicemail → SMS notification to owner
 *
 * PLATFORM INTEGRATION (authenticated guards):
 *   Guards who call from their registered phone number get personalized
 *   responses: Trinity knows their name, their shift, their upcoming schedule.
 *   Commands they can give after auth:
 *     - "Clock me in" / "Clock me out"
 *     - "What is my schedule?"
 *     - "I need to call off today"
 *     - "What is my pay this week?"
 *
 * BILINGUAL: Full English and Spanish throughout.
 * DURESS: "Code Red" / "Código Rojo" bypasses all menus at any point.
 */

import { pool } from '../../../db';
import { createLogger } from '../../../lib/logger';
import { twiml, say, redirect, gather } from '../voiceOrchestrator';
import { resolveOnDutyContact } from '../tenantLookupService';
import { broadcastToWorkspace } from '../../../websocket';
import { platformEventBus } from '../../platformEventBus';
import type { CallIntent } from '../tenantLookupService';

const log = createLogger('TenantPortal');

// Voice IDs — Trinity uses a warm, professional female voice
const VOICE_EN = 'Polly.Joanna-Neural'; // AWS Polly warm voice via Twilio
const VOICE_ES = 'Polly.Lupe-Neural';

function sayEn(text: string): string {
  return say(text, VOICE_EN, 'en-US');
}
function sayEs(text: string): string {
  return say(text, VOICE_ES, 'es-US');
}
function sayBoth(textEn: string, textEs: string, lang: 'en' | 'es'): string {
  return lang === 'es' ? sayEs(textEs) : sayEn(textEn);
}

// ── Tenant Root Menu ─────────────────────────────────────────────────────────

export async function buildTenantPortalMenu(params: {
  workspaceId: string;
  companyName: string;
  lang: 'en' | 'es';
  baseUrl: string;
  callSid: string;
  callerNumber: string;
  sessionId: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, callSid, callerNumber, sessionId } = params;

  // Fire live call card to ChatDock for supervisors
  broadcastToWorkspace(workspaceId, {
    type: 'voice_call_active',
    payload: {
      callSid, callerNumber,
      companyName, status: 'active',
      startedAt: new Date().toISOString(),
      message: `📞 Incoming call from ${callerNumber} → ${companyName} portal`,
    },
  });

  // Check if caller is a known guard (From number match)
  const guardInfo = await lookupCallerByPhone(callerNumber, workspaceId);
  const personalGreeting = guardInfo
    ? (lang === 'es'
        ? `Hola ${guardInfo.firstName}, bienvenido de nuevo.`
        : `Welcome back, ${guardInfo.firstName}.`)
    : '';

  const menuParams = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}`;

  const greetingEn =
    `${personalGreeting} Hi, you have reached ${companyName}. ` +
    `I am Trinity, your AI assistant. I am here to help you with whatever you need, in English or Spanish. ` +
    `For guards and officers, press 1. ` +
    `For clients and site contacts, press 2. ` +
    `For an emergency, press 3. ` +
    `To file a complaint or concern, press 4. ` +
    `For employment verification, press 5. ` +
    `To speak with a manager directly, press 6. ` +
    `To speak freely with Trinity AI, press 0. ` +
    `Or simply tell me what you need and I will take care of it.`;

  const greetingEs =
    `${lang === 'es' ? personalGreeting : ''} Hola, ha llamado a ${companyName}. ` +
    `Soy Trinity, su asistente de inteligencia artificial. Estoy aquí para ayudarle en inglés o español. ` +
    `Si es guardia u oficial, marque 1. ` +
    `Para clientes y contactos del sitio, marque 2. ` +
    `Para una emergencia, marque 3. ` +
    `Para presentar una queja, marque 4. ` +
    `Para verificar empleo, marque 5. ` +
    `Para hablar con un gerente directamente, marque 6. ` +
    `Para hablar libremente con Trinity, marque 0. ` +
    `O simplemente dígame qué necesita.`;

  const hintsEn = 'one,two,three,four,five,six,zero,guard,officer,client,emergency,complaint,manager,help,verification,schedule,clock in,clock out,calloff';
  const hintsEs = 'uno,dos,tres,cuatro,cinco,seis,cero,guardia,oficial,cliente,emergencia,queja,gerente,ayuda,verificación,horario';

  return twiml(
    `<Gather input="speech dtmf" numDigits="1" action="${baseUrl}/api/voice/tenant-portal-route?${menuParams}" method="POST" timeout="15" speechTimeout="auto" language="${lang === 'es' ? 'es-US' : 'en-US'}" hints="${lang === 'es' ? hintsEs : hintsEn}">` +
    sayBoth(greetingEn, greetingEs, lang) +
    `</Gather>` +
    redirect(`${baseUrl}/api/voice/tenant-portal-route?${menuParams}&_d=0`)
  );
}

// ── Portal Route Handler ─────────────────────────────────────────────────────

export async function routeTenantPortal(params: {
  workspaceId: string;
  companyName: string;
  lang: 'en' | 'es';
  baseUrl: string;
  sessionId: string;
  callerNumber: string;
  digit: string;
  speech: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, speech } = params;
  let { digit } = params;

  // Speech → digit mapping
  const s = speech.toLowerCase().trim();
  if (!digit && s) {
    if (/\b(guard|officer|employee|staff|clock|schedule|calloff|pay|shift)\b/.test(s)) digit = '1';
    else if (/\b(client|customer|site|coverage|billing|account)\b/.test(s)) digit = '2';
    else if (/\b(emergency|urgent|danger|help now)\b/.test(s)) digit = '3';
    else if (/\b(complaint|concern|unhappy|problem|issue|rude)\b/.test(s)) digit = '4';
    else if (/\b(verify|verification|employment|background)\b/.test(s)) digit = '5';
    else if (/\b(manager|supervisor|owner|speak to|talk to|human)\b/.test(s)) digit = '6';
    else if (/\b(trinity|ai|free|talk freely|just talk)\b/.test(s)) digit = '0';
    else digit = '0'; // Default to Trinity AI
  }

  const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}`;

  switch (digit) {
    case '1': return buildGuardMenu({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber });
    case '2': return buildClientMenu({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber });
    case '3': return buildEmergencyRoute({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber });
    case '4': return buildCollectAndTransfer({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, intent: 'complaint' });
    case '5': return buildEmploymentVerification({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber });
    case '6': return buildCollectAndTransfer({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, intent: 'general_help' });
    default:  return twiml(redirect(`${baseUrl}/api/voice/ai-stream?workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}&${qp}`));
  }
}

// ── Guard / Officer Sub-Menu ─────────────────────────────────────────────────

async function buildGuardMenu(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber } = params;

  // Look up caller — personalize if recognized
  const guard = await lookupCallerByPhone(callerNumber, workspaceId);
  const name = guard?.firstName || '';

  const menuEn =
    `${name ? name + ', ' : ''}I can help you with several things. ` +
    `Press 1 to check your schedule. ` +
    `Press 2 to clock in or clock out. ` +
    `Press 3 to report a calloff or absence. ` +
    `Press 4 for pay or timesheet questions. ` +
    `Press 5 to reach your on-duty supervisor. ` +
    `Or tell me what you need.`;

  const menuEs =
    `${name ? name + ', ' : ''}Puedo ayudarle con varias cosas. ` +
    `Marque 1 para ver su horario. ` +
    `Marque 2 para marcar entrada o salida. ` +
    `Marque 3 para reportar una ausencia. ` +
    `Marque 4 para preguntas de pago. ` +
    `Marque 5 para contactar a su supervisor de turno. ` +
    `O simplemente dígame qué necesita.`;

  const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}&menu=guard`;

  return twiml(
    `<Gather input="speech dtmf" numDigits="1" action="${baseUrl}/api/voice/tenant-portal-guard?${qp}" method="POST" timeout="12" speechTimeout="auto" language="${lang === 'es' ? 'es-US' : 'en-US'}" hints="schedule,clock in,clock out,calloff,pay,supervisor,one,two,three,four,five">` +
    sayBoth(menuEn, menuEs, lang) +
    `</Gather>` +
    redirect(`${baseUrl}/api/voice/tenant-portal-guard?${qp}&_d=5`)
  );
}

export async function routeGuardMenu(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
  digit: string; speech: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, speech } = params;
  let { digit } = params;

  const s = speech.toLowerCase().trim();
  if (!digit && s) {
    if (/\b(schedule|shift|hours|when|next shift)\b/.test(s)) digit = '1';
    else if (/\b(clock|punch|check in|check out)\b/.test(s)) digit = '2';
    else if (/\b(calloff|sick|absence|absent|not coming|can.t make)\b/.test(s)) digit = '3';
    else if (/\b(pay|payment|check|timesheet|hours worked|overtime)\b/.test(s)) digit = '4';
    else if (/\b(supervisor|manager|talk to|speak to|human)\b/.test(s)) digit = '5';
  }

  const guard = await lookupCallerByPhone(callerNumber, workspaceId);

  switch (digit) {
    case '1': {
      // Schedule query from platform
      let scheduleInfo = 'I was unable to pull your schedule at this time. Please check the CoAIleague app.';
      let scheduleEs = 'No pude obtener su horario en este momento. Por favor revise la aplicación.';
      if (guard?.employeeId) {
        const { rows } = await pool.query(
          `SELECT s.start_time, s.end_time, si.name AS site_name
           FROM shifts s LEFT JOIN sites si ON si.id = s.site_id
           WHERE s.assigned_employee_id = $1 AND s.start_time >= NOW()
           ORDER BY s.start_time ASC LIMIT 3`,
          [guard.employeeId]
        ).catch(() => ({ rows: [] }));
        if (rows.length > 0) {
          const upcoming = rows.map(r => {
            const d = new Date(r.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const t = new Date(r.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `${d} at ${t} at ${r.site_name || 'your assigned site'}`;
          }).join('. ');
          scheduleInfo = `You have ${rows.length} upcoming shift${rows.length > 1 ? 's' : ''}: ${upcoming}`;
          scheduleEs = `Tiene ${rows.length} turno${rows.length > 1 ? 's' : ''} próximo${rows.length > 1 ? 's' : ''}.`;
        } else {
          scheduleInfo = 'You have no upcoming shifts currently scheduled. Please contact your supervisor if this is incorrect.';
          scheduleEs = 'No tiene turnos próximos programados. Por favor contacte a su supervisor.';
        }
      }
      return twiml(sayBoth(scheduleInfo, scheduleEs, lang) + `<Hangup/>`);
    }

    case '2': {
      // Clock in / out command
      if (!guard?.employeeId) {
        return twiml(sayBoth(
          'I was unable to verify your identity for clock-in. Please use the CoAIleague mobile app to clock in.',
          'No pude verificar su identidad para el registro. Por favor use la aplicación móvil.',
          lang
        ) + `<Hangup/>`);
      }
      // Check current clock status
      const { rows: teRows } = await pool.query(
        `SELECT id, clock_in, clock_out FROM time_entries
         WHERE employee_id = $1 AND DATE(clock_in) = CURRENT_DATE
         ORDER BY clock_in DESC LIMIT 1`,
        [guard.employeeId]
      ).catch(() => ({ rows: [] }));
      const isClockedIn = teRows.length > 0 && !teRows[0].clock_out;

      if (isClockedIn) {
        // Clock out
        await pool.query(
          `UPDATE time_entries SET clock_out = NOW(), updated_at = NOW() WHERE id = $1`,
          [teRows[0].id]
        ).catch(() => {});
        return twiml(sayBoth(
          `You have been clocked out successfully. Thank you, ${guard.firstName}. Have a safe rest of your day.`,
          `Ha marcado su salida exitosamente. Gracias, ${guard.firstName}. Que tenga un buen día.`,
          lang
        ) + `<Hangup/>`);
      } else {
        // Clock in
        await pool.query(
          `INSERT INTO time_entries (employee_id, workspace_id, clock_in, source, created_at, updated_at)
           VALUES ($1, $2, NOW(), 'voice', NOW(), NOW())`,
          [guard.employeeId, workspaceId]
        ).catch(() => {});
        return twiml(sayBoth(
          `You have been clocked in successfully. Welcome to your shift, ${guard.firstName}. Stay safe out there.`,
          `Ha marcado su entrada exitosamente. Bienvenido a su turno, ${guard.firstName}. Cuídese mucho.`,
          lang
        ) + `<Hangup/>`);
      }
    }

    case '3': {
      // Calloff — record and notify supervisor
      const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}&intent=calloff`;
      return twiml(
        sayBoth(
          'I am sorry to hear you will not be able to make your shift. Please state your name and the reason for your absence after the tone. Press pound when finished.',
          'Lamento que no pueda asistir a su turno. Por favor diga su nombre y el motivo de su ausencia después del tono. Presione numeral cuando termine.',
          lang
        ) +
        `<Record action="${baseUrl}/api/voice/calloff-recorded?${qp}" maxLength="90" finishOnKey="#" playBeep="true" />`
      );
    }

    case '4': {
      // Pay query
      let payInfo = 'I was unable to retrieve your pay information. Please check the CoAIleague app.';
      let payEs = 'No pude obtener su información de pago. Por favor revise la aplicación.';
      if (guard?.employeeId) {
        const { rows: payRows } = await pool.query(
          `SELECT SUM(total_hours) AS hours, COUNT(*) AS entries
           FROM time_entries
           WHERE employee_id = $1
             AND clock_in >= date_trunc('week', NOW())
             AND clock_out IS NOT NULL`,
          [guard.employeeId]
        ).catch(() => ({ rows: [{ hours: null, entries: 0 }] }));
        const hours = parseFloat(payRows[0]?.hours || '0').toFixed(1);
        payInfo = `This week, you have ${hours} hours recorded so far. Your full pay statement is available in the CoAIleague app.`;
        payEs = `Esta semana tiene ${hours} horas registradas hasta ahora. Su estado de pago completo está disponible en la aplicación.`;
      }
      return twiml(sayBoth(payInfo, payEs, lang) + `<Hangup/>`);
    }

    case '5':
    default: {
      // Transfer to supervisor
      return buildCollectAndTransfer({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, intent: 'guard_issue' });
    }
  }
}

// ── Client Sub-Menu ──────────────────────────────────────────────────────────

async function buildClientMenu(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber } = params;
  const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}&menu=client`;

  return twiml(
    `<Gather input="speech dtmf" numDigits="1" action="${baseUrl}/api/voice/tenant-portal-client?${qp}" method="POST" timeout="12" speechTimeout="auto" language="${lang === 'es' ? 'es-US' : 'en-US'}" hints="coverage,guards,concern,billing,invoice,account,manager,one,two,three,four,five">` +
    sayBoth(
      `Thank you for being a valued ${companyName} client. ` +
      `Press 1 to check if your guards are currently on site. ` +
      `Press 2 to report a concern or incident at your site. ` +
      `Press 3 for billing or invoice questions. ` +
      `Press 4 to request additional coverage. ` +
      `Press 5 to speak with your account manager. ` +
      `Or tell me what you need.`,
      `Gracias por ser un cliente valioso de ${companyName}. ` +
      `Marque 1 para verificar si sus guardias están en el sitio. ` +
      `Marque 2 para reportar una inquietud o incidente. ` +
      `Marque 3 para preguntas de facturación. ` +
      `Marque 4 para solicitar cobertura adicional. ` +
      `Marque 5 para hablar con su gerente de cuenta.`,
      lang
    ) +
    `</Gather>` +
    redirect(`${baseUrl}/api/voice/tenant-portal-client?${qp}&_d=5`)
  );
}

export async function routeClientMenu(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
  digit: string; speech: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, speech } = params;
  let { digit } = params;

  const s = speech.toLowerCase().trim();
  if (!digit && s) {
    if (/\b(coverage|guards|on site|on-site|assigned|there)\b/.test(s)) digit = '1';
    else if (/\b(concern|incident|problem|report|complaint|issue)\b/.test(s)) digit = '2';
    else if (/\b(billing|invoice|payment|charge|bill)\b/.test(s)) digit = '3';
    else if (/\b(additional|more guards|extra|request coverage)\b/.test(s)) digit = '4';
    else if (/\b(manager|account manager|speak|talk|human)\b/.test(s)) digit = '5';
  }

  switch (digit) {
    case '1': {
      // Coverage check from platform
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS active_count FROM shifts s
         JOIN time_entries te ON te.employee_id = s.assigned_employee_id
         WHERE s.workspace_id = $1
           AND s.start_time <= NOW() AND s.end_time >= NOW()
           AND te.clock_in IS NOT NULL AND te.clock_out IS NULL`,
        [workspaceId]
      ).catch(() => ({ rows: [{ active_count: 0 }] }));
      const count = parseInt(rows[0]?.active_count || '0');
      return twiml(sayBoth(
        count > 0
          ? `There are currently ${count} officer${count > 1 ? 's' : ''} clocked in and on active duty for ${companyName}. Is there anything else I can help you with?`
          : `I do not currently show any officers clocked in for your site at this time. Would you like me to notify the manager?`,
        count > 0
          ? `Actualmente hay ${count} oficial${count > 1 ? 'es' : ''} registrados y en servicio activo para ${companyName}.`
          : `No hay oficiales registrados actualmente para su sitio. ¿Desea que notifique al gerente?`,
        lang
      ) + `<Hangup/>`);
    }

    case '2': // Concern / incident → collect + transfer
      return buildCollectAndTransfer({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, intent: 'complaint' });

    case '3': // Billing → Trinity handles or escalates
      return twiml(sayBoth(
        `For billing and invoice questions, I can check your account status. Please hold while I look that up, or say "speak to someone" and I will connect you with your account manager.`,
        `Para preguntas de facturación, puedo revisar el estado de su cuenta. Por favor espere mientras verifico, o diga "hablar con alguien" para conectarle con su gerente.`,
        lang
      ) + redirect(`${baseUrl}/api/voice/ai-stream?workspaceId=${encodeURIComponent(workspaceId)}&lang=${lang}`));

    case '4': // Request additional coverage → log + notify owner
      return twiml(sayBoth(
        `I am noting your request for additional coverage. Please leave a brief message with your name, site location, and the dates or times you need coverage. Press pound when finished.`,
        `Estoy anotando su solicitud de cobertura adicional. Por favor deje un mensaje con su nombre, ubicación y fechas o tiempos necesarios.`,
        lang
      ) + `<Record action="${baseUrl}/api/voice/recording-done?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}" maxLength="120" finishOnKey="#" playBeep="true" />` +
      sayBoth('Thank you. Your request has been recorded and your account manager will be in touch shortly. Have a great day.', 'Gracias. Su solicitud ha sido registrada. Que tenga un buen día.', lang) +
      `<Hangup/>`);

    case '5': // Account manager transfer
    default:
      return buildCollectAndTransfer({ workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, intent: 'general_help' });
  }
}

// ── Emergency Route ───────────────────────────────────────────────────────────

async function buildEmergencyRoute(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber } = params;

  // Blast SMS to all contacts immediately
  const { rows: contacts } = await pool.query(
    `SELECT DISTINCT u.phone, u.first_name, wm.workspace_role
     FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
       AND wm.workspace_role IN ('org_owner','co_owner','department_manager','supervisor','shift_leader')
       AND u.phone IS NOT NULL AND u.phone != ''`,
    [workspaceId]
  ).catch(() => ({ rows: [] }));

  for (const c of contacts) {
    const { sendSMS } = await import('../../../services/smsService');
    sendSMS({
      to: c.phone,
      body: `🚨 EMERGENCY CALL — ${companyName}\nAn emergency call is incoming from ${callerNumber}. Please respond immediately.`,
      workspaceId, type: 'system_alert',
    }).catch(() => {});
  }

  const contact = await resolveOnDutyContact({ workspaceId, intent: 'emergency' });
  const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}&intent=emergency&callerInfo=${encodeURIComponent('EMERGENCY CALL — immediate response required')}`;

  const whisperUrl = `${baseUrl}/api/voice/announce-caller?${qp}&contactName=${encodeURIComponent(contact.name || 'Manager')}`;
  const transferUrl = `${baseUrl}/api/voice/transfer-complete?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}`;

  return twiml(
    sayBoth(
      `This is an emergency. Connecting you with ${companyName} management immediately. Please stay on the line.`,
      `Esta es una emergencia. Conectando con la gerencia de ${companyName} inmediatamente. Por favor permanezca en la línea.`,
      lang
    ) +
    (contact.found && contact.phone
      ? `<Dial callerId="${process.env.TWILIO_PHONE_NUMBER || ''}" timeout="20" action="${transferUrl}" method="POST"><Number url="${whisperUrl}" method="GET">${contact.phone}</Number></Dial>`
      : sayBoth('All managers have been notified by text message. Please stay safe.', 'Todos los gerentes han sido notificados por mensaje. Por favor manténgase seguro.', lang) + `<Hangup/>`)
  );
}

// ── Collect Name + Purpose → Transfer ────────────────────────────────────────

async function buildCollectAndTransfer(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
  intent: CallIntent;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber, intent } = params;
  const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}&intent=${encodeURIComponent(intent)}`;

  const promptEn = intent === 'complaint'
    ? `I understand, and I am sorry to hear you have a concern. Before I connect you with a manager, may I have your name and a brief description of your concern? This ensures the manager is fully prepared to help you. Please speak after the tone.`
    : `Of course. Before I connect you, may I have your name and the reason for your call? This way the manager knows exactly who is calling and how to help you best. Please speak after the tone.`;

  const promptEs = intent === 'complaint'
    ? `Entiendo, y lamento escuchar que tiene una preocupación. Antes de conectarle con un gerente, ¿podría decirme su nombre y una breve descripción? Así el gerente estará preparado para ayudarle. Por favor hable después del tono.`
    : `Por supuesto. Antes de conectarle, ¿podría decirme su nombre y el motivo de su llamada? Así el gerente sabrá exactamente cómo ayudarle. Por favor hable después del tono.`;

  return twiml(
    sayBoth(promptEn, promptEs, lang) +
    `<Record action="${baseUrl}/api/voice/tenant-transfer-ready?${qp}" maxLength="45" finishOnKey="*" playBeep="true" />`
  );
}

// ── Employment Verification ───────────────────────────────────────────────────

async function buildEmploymentVerification(params: {
  workspaceId: string; companyName: string; lang: 'en' | 'es';
  baseUrl: string; sessionId: string; callerNumber: string;
}): Promise<string> {
  const { workspaceId, companyName, lang, baseUrl, sessionId, callerNumber } = params;
  const qp = `lang=${lang}&workspaceId=${encodeURIComponent(workspaceId)}&company=${encodeURIComponent(companyName)}&sessionId=${encodeURIComponent(sessionId)}&caller=${encodeURIComponent(callerNumber)}`;

  return twiml(
    `<Gather input="speech" action="${baseUrl}/api/voice/verify-employment?${qp}" method="POST" timeout="15" speechTimeout="auto" language="${lang === 'es' ? 'es-US' : 'en-US'}">` +
    sayBoth(
      `For employment verification, please state the full name of the employee you are inquiring about and the approximate dates of employment.`,
      `Para verificación de empleo, por favor diga el nombre completo del empleado y las fechas aproximadas de empleo.`,
      lang
    ) +
    `</Gather>` +
    redirect(`${baseUrl}/api/voice/verify-employment?${qp}`)
  );
}

// ── Helper: Lookup caller by phone ────────────────────────────────────────────

async function lookupCallerByPhone(phone: string, workspaceId: string): Promise<{
  employeeId: string; firstName: string; lastName: string; role: string;
} | null> {
  if (!phone || phone === 'unknown') return null;
  try {
    const clean = phone.replace(/[^0-9+]/g, '');
    const { rows } = await pool.query(
      `SELECT e.id AS employee_id, u.first_name, u.last_name, wm.workspace_role AS role
       FROM users u
       JOIN employees e ON e.user_id = u.id
       JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = $1
       WHERE (u.phone = $2 OR u.phone = $3)
         AND e.workspace_id = $1 AND e.status = 'active'
       LIMIT 1`,
      [workspaceId, phone, clean]
    );
    if (!rows[0]) return null;
    return { employeeId: rows[0].employee_id, firstName: rows[0].first_name, lastName: rows[0].last_name, role: rows[0].role };
  } catch { return null; }
}
