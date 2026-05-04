/**
 * Guest Extension — Wave 16 / Trinity Voice Phone System
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles ALL callers who are NOT existing platform employees:
 *   • New CoAIleague prospects
 *   • Clients of a tenant security company
 *   • People with complaints or compliments
 *   • Law enforcement (police, detectives, investigators)
 *   • Anyone who needs to reach a specific registered tenant
 *
 * FLOW:
 *   1. handleGuestIdentify   — "Why are you calling today?"
 *   2. handleTenantLookup    — license # or company name → workspace resolved
 *   3. handleTenantMenu      — tenant-specific 6-item phone portal
 *   4. handleCollectCallerInfo — Trinity captures caller name + purpose
 *   5. handleSmartTransfer   — priority waterfall <Dial> with whisper
 *   6. handleAnnouncement    — Trinity announces to recipient before bridging
 *   7. handleTransferComplete — Twilio callback after <Dial> ends
 *
 * PRIORITY WATERFALL (all tenants):
 *   Supervisor on duty → Manager on duty → Co-owner → Owner → Voicemail
 *
 * STATEWIDE FIRST:
 *   All paths currently waterfall to Bryan at 830-213-4562.
 *   As supervisors and managers are added to Statewide, they intercept first.
 *
 * TRINITY PERSONALITY:
 *   Patient, warm, bilingual (en/es), explains clearly, never rushes the caller,
 *   always confirms before transferring, announces herself stepping out.
 */

import { twiml, logCallAction } from "../voiceOrchestrator";
import { pool } from "../../../db";
import { createLogger } from "../../../lib/logger";
import {
  lookupByLicenseNumber,
  lookupByCompanyName,
  resolveOnDutyContact,
  logGuestInteraction,
  detectCallIntent,
  type CallIntent,
  type TenantRecord,
} from "../tenantLookupService";

const log = createLogger("guestExtension");

// ── TwiML helpers (bilingual) ─────────────────────────────────────────────────
const say = (text: string, lang: "en" | "es" = "en"): string =>
  lang === "es"
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

const pause = (seconds = 1): string =>
  `<Pause length="${seconds}"/>`;

// ── STEP 1: Guest Identify — "Why are you calling today?" ────────────────────

export function handleGuestIdentify(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: "en" | "es";
  baseUrl: string;
}): string {
  const { sessionId, workspaceId, lang, baseUrl } = params;
  const action = `${baseUrl}/api/voice/tenant-lookup?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&intent=general_help`;

  logCallAction({ callSessionId: sessionId, workspaceId, action: "guest_identify", payload: {}, outcome: "initiated" }).catch(() => {});

  if (lang === "es") {
    return twiml(
      say(`Gracias por llamar. Estoy aquí para ayudarle a comunicarse con la empresa de seguridad correcta.
          Por favor dígame el nombre de la empresa de seguridad, o si lo tiene disponible, 
          su número de licencia estatal. Por ejemplo, puede decir: 
          "Statewide Protective Services" o "licencia C uno uno seis cero ocho cinco cero uno".
          Tome todo el tiempo que necesite.`, "es") +
      `<Gather input="speech" action="${action}&intent=general_help" method="POST" timeout="20" speechTimeout="auto" language="es-US" hints="licencia,número,empresa,seguridad,statewide,protective">` +
      say("Cuando esté listo, diga el nombre o número de licencia de la empresa.", "es") +
      `</Gather>` +
      `<Redirect method="POST">${action}&intent=general_help</Redirect>`
    );
  }

  return twiml(
    say(`Of course. I am here to connect you with the right security company.
        Please tell me the name of the security company you are trying to reach, 
        or if you have it, their state license number. 
        For example, you can say "Statewide Protective Services" 
        or "license C one one six zero eight five zero one".
        Take your time — I am listening.`) +
    `<Gather input="speech" action="${action}&intent=general_help" method="POST" timeout="20" speechTimeout="auto" language="en-US" hints="statewide,protective,security,license,company,services">` +
    say("Whenever you are ready, say the company name or license number.") +
    `</Gather>` +
    `<Redirect method="POST">${action}&intent=general_help</Redirect>`
  );
}

// ── STEP 2: Tenant Lookup — resolve workspace from spoken input ───────────────

export async function handleTenantLookup(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: "en" | "es";
  baseUrl: string;
  speechResult: string;
  intent: string;
  callerNumber: string;
  retryCount?: number;
}): Promise<string> {
  const { callSid, sessionId, workspaceId, lang, baseUrl, speechResult, intent, callerNumber } = params;
  const retryCount = params.retryCount || 0;

  let tenant: TenantRecord | null = null;
  let badgeNumber: string | undefined;

  const spoken = (speechResult || "").trim();
  log.info(`[GuestExt] Lookup spoken: "${spoken}" intent=${intent}`);

  // Extract license number (letter + digits pattern e.g. C11608501)
  const licenseMatch = spoken.match(/[Cc]\s*(\d[\d\s]{4,9})/);
  if (licenseMatch) {
    const licNum = "C" + licenseMatch[1].replace(/\s/g, "");
    tenant = await lookupByLicenseNumber(licNum);
    log.info(`[GuestExt] License lookup "${licNum}" → ${tenant?.companyName || "not found"}`);
  }

  // Extract badge number for law enforcement
  if (intent === "law_enforcement") {
    const badgeMatch = spoken.match(/(\d{3,8})/);
    if (badgeMatch) badgeNumber = badgeMatch[1];
  }

  // Fuzzy company name lookup
  if (!tenant && spoken.length > 2) {
    tenant = await lookupByCompanyName(spoken);
    log.info(`[GuestExt] Name lookup "${spoken}" → ${tenant?.companyName || "not found"}`);
  }

  if (!tenant) {
    if (retryCount >= 2) {
      // After 2 failed attempts — offer to stay with Trinity AI
      const sorryMsg = lang === "es"
        ? `Lo siento, no pude encontrar esa empresa en nuestro sistema después de varios intentos.
           Si lo desea, puedo conectarle con Trinity para ayuda general, o puede intentar llamar directamente a la empresa.
           Que tenga un buen día.`
        : `I am sorry, I was not able to find that company in our system after a few attempts.
           If you would like, I can connect you with Trinity for general assistance, 
           or you can try reaching the company directly.
           Thank you for calling and have a wonderful day.`;
      return twiml(say(sorryMsg, lang) + `<Hangup/>`);
    }

    const retryMsg = lang === "es"
      ? `Lo siento, no pude encontrar esa empresa. Por favor intente de nuevo.
         Puede decir el nombre completo de la empresa, como "Statewide Protective Services",
         o el número de licencia estatal, como "C uno uno seis cero ocho".
         Por favor inténtelo de nuevo.`
      : `I am sorry, I could not find that company. Let me try again.
         You can say the full company name — for example, "Statewide Protective Services" —
         or the state license number, such as "C one one six zero eight".
         Please go ahead whenever you are ready.`;

    const retryAction = `${baseUrl}/api/voice/tenant-lookup?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(workspaceId)}&intent=${encodeURIComponent(intent)}&retry=${retryCount + 1}`;
    return twiml(
      say(retryMsg, lang) +
      `<Gather input="speech" action="${retryAction}" method="POST" timeout="20" speechTimeout="auto" language="${lang === "es" ? "es-US" : "en-US"}">` +
      say(lang === "es" ? "Escucho." : "I am listening.", lang) +
      `</Gather>` +
      `<Redirect method="POST">${retryAction}</Redirect>`
    );
  }

  // Log the interaction
  await logGuestInteraction({
    callSid,
    callerNumber,
    callerType: intent === "law_enforcement" ? "law_enforcement" : "client_of_tenant",
    intent: detectCallIntent(spoken),
    tenantWorkspaceId: tenant.workspaceId,
    tenantName: tenant.companyName,
    badgeNumber,
    notes: spoken,
  });

  // Found — announce and route to tenant menu
  const foundMsg = lang === "es"
    ? `Encontré a ${tenant.companyName}. Un momento por favor, voy a conectarle con su portal.`
    : `I found ${tenant.companyName}. One moment please — connecting you to their portal now.`;

  // Wave 16: Route to the full tenant portal (replaces old tenant-menu stub)
  const menuUrl = `${baseUrl}/api/voice/tenant-portal?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(tenant.workspaceId)}&company=${encodeURIComponent(tenant.companyName)}&intent=${encodeURIComponent(intent)}&badge=${encodeURIComponent(badgeNumber || "")}`;

  logCallAction({ callSessionId: sessionId, workspaceId: tenant.workspaceId, action: "tenant_resolved", payload: { tenantName: tenant.companyName, intent }, outcome: "success" }).catch(() => {});

  return twiml(
    say(foundMsg, lang) +
    pause(1) +
    `<Redirect method="POST">${menuUrl}</Redirect>`
  );
}

// ── STEP 3: Tenant Menu — the company's phone portal ─────────────────────────

export function handleTenantMenu(params: {
  sessionId: string;
  tenantWorkspaceId: string;
  companyName: string;
  lang: "en" | "es";
  baseUrl: string;
  digits?: string;
  speechResult?: string;
  intent?: string;
}): string {
  const { sessionId, tenantWorkspaceId, companyName, lang, baseUrl } = params;
  let { digits } = params;
  const spoken = (params.speechResult || "").toLowerCase().trim();
  const intent = params.intent || "general_help";

  // Speech → digit mapping
  if (!digits && spoken) {
    if (/(guard|officer|employee|staff|i work|my shift|clock|schedule|pay|calloff)/.test(spoken)) digits = "1";
    else if (/(client|site|my location|my site|your guards|check in|coverage)/.test(spoken)) digits = "2";
    else if (/(emergency|urgent|danger|immediate|help now)/.test(spoken)) digits = "3";
    else if (/(complain|complaint|problem|issue|unhappy|concerned|rude|unprofessional)/.test(spoken)) digits = "4";
    else if (/(verify|verification|background|employment|confirm)/.test(spoken)) digits = "5";
    else if (/(manager|supervisor|owner|human|person|speak to|talk to|transfer)/.test(spoken)) digits = "6";
    else if (/(trinity|ai|assistant|help|question|anything|zero)/.test(spoken)) digits = "0";
  }

  // Law enforcement goes straight to option 6 (manager/owner)
  if (intent === "law_enforcement" && !digits) digits = "6";

  const collectUrl = (intentLabel: string) =>
    `${baseUrl}/api/voice/collect-caller-info?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&tenantWorkspaceId=${encodeURIComponent(tenantWorkspaceId)}&company=${encodeURIComponent(companyName)}&intent=${encodeURIComponent(intentLabel)}`;

  if (digits === "1") {
    // Guard/employee sub-menu
    if (lang === "es") {
      return twiml(
        say(`Personal de ${companyName}. Tengo varias opciones para usted.
            Para revisar su horario, marque 1.
            Para reportar una ausencia o llamada de emergencia, marque 2.
            Para preguntas sobre su pago o tiempo, marque 3.
            Para hablar con su supervisor, marque 4.`, "es") +
        `<Gather input="speech dtmf" numDigits="1" action="${collectUrl("guard_issue")}&submenu=1" method="POST" timeout="12" speechTimeout="auto" language="es-US">` +
        say("¿En qué puedo ayudarle?", "es") +
        `</Gather>` +
        `<Redirect method="POST">${collectUrl("guard_issue")}&submenu=1</Redirect>`
      );
    }
    return twiml(
      say(`${companyName} staff services. I have a few options for you.
          To check your schedule, press 1.
          To report a calloff or absence, press 2.
          For pay or timesheet questions, press 3.
          To speak with your supervisor, press 4.`) +
      `<Gather input="speech dtmf" numDigits="1" action="${collectUrl("guard_issue")}&submenu=1" method="POST" timeout="12" speechTimeout="auto" language="en-US">` +
      say("How can I help you today?") +
      `</Gather>` +
      `<Redirect method="POST">${collectUrl("guard_issue")}&submenu=1</Redirect>`
    );
  }

  if (digits === "2") {
    // Client/site contact sub-menu
    if (lang === "es") {
      return twiml(
        say(`Portal de clientes de ${companyName}.
            Para verificar si sus guardias están en sitio, marque 1.
            Para reportar una inquietud en su sitio, marque 2.
            Para preguntas de facturación, marque 3.
            Para hablar directamente con el administrador de su cuenta, marque 4.`, "es") +
        `<Gather input="speech dtmf" numDigits="1" action="${collectUrl("complaint")}&submenu=2" method="POST" timeout="12" speechTimeout="auto" language="es-US">` +
        say("Estoy escuchando.", "es") +
        `</Gather>`
      );
    }
    return twiml(
      say(`${companyName} client services.
          To verify your guards are currently on site, press 1.
          To report a concern at your location, press 2.
          For billing or invoice questions, press 3.
          To speak directly with your account manager, press 4.`) +
      `<Gather input="speech dtmf" numDigits="1" action="${collectUrl("complaint")}&submenu=2" method="POST" timeout="12" speechTimeout="auto" language="en-US">` +
      say("I am listening.") +
      `</Gather>`
    );
  }

  if (digits === "3") {
    // Emergency — immediate transfer, no menu
    return twiml(
      say(lang === "es"
        ? `Emergencia entendida. Conectando con el responsable de turno de ${companyName} inmediatamente. Un momento.`
        : `Emergency understood. Connecting you with ${companyName}'s on-duty manager right away. Please hold.`, lang) +
      `<Redirect method="POST">${collectUrl("emergency")}&skipInfo=true</Redirect>`
    );
  }

  if (digits === "4") {
    // Complaint — collect info first
    if (lang === "es") {
      return twiml(
        say(`Lamento escuchar que tiene una preocupación. Me aseguraré de que llegue a la persona correcta.
            Antes de transferirle, ¿podría decirme su nombre y describirme brevemente su inquietud?
            Tome todo el tiempo que necesite.`, "es") +
        `<Gather input="speech" action="${collectUrl("complaint")}" method="POST" timeout="25" speechTimeout="auto" language="es-US">` +
        say("Adelante, le escucho.", "es") +
        `</Gather>` +
        `<Redirect method="POST">${collectUrl("complaint")}</Redirect>`
      );
    }
    return twiml(
      say(`I am sorry to hear you have a concern, and I want to make sure it gets to the right person.
          Before I connect you, could you please tell me your name and briefly describe the situation?
          Take all the time you need — I am listening carefully.`) +
      `<Gather input="speech" action="${collectUrl("complaint")}" method="POST" timeout="25" speechTimeout="auto" language="en-US">` +
      say("Go ahead whenever you are ready.") +
      `</Gather>` +
      `<Redirect method="POST">${collectUrl("complaint")}</Redirect>`
    );
  }

  if (digits === "5") {
    // Employment verification
    return twiml(
      say(lang === "es"
        ? `Verificación de empleo. Por favor diga el nombre completo del empleado que desea verificar.`
        : `Employment verification. Please say the full name of the employee you would like to verify.`, lang) +
      `<Gather input="speech" action="${collectUrl("verify")}" method="POST" timeout="15" speechTimeout="auto" language="${lang === "es" ? "es-US" : "en-US"}">` +
      say(lang === "es" ? "Le escucho." : "I am listening.", lang) +
      `</Gather>` +
      `<Redirect method="POST">${collectUrl("verify")}</Redirect>`
    );
  }

  if (digits === "6") {
    // Direct to manager — collect name and purpose first
    const lawEnfMsg = intent === "law_enforcement"
      ? (lang === "es" ? "Autoridad de aplicación de la ley, " : "Law enforcement, ")
      : "";
    if (lang === "es") {
      return twiml(
        say(`${lawEnfMsg}con gusto le conecto con el responsable de ${companyName}.
            Antes de transferirle, ¿podría decirme su nombre y el propósito de su llamada?
            Así puedo informarle para que no sea tomado por sorpresa.`, "es") +
        `<Gather input="speech" action="${collectUrl(intent === "law_enforcement" ? "law_enforcement" : "general_help")}" method="POST" timeout="20" speechTimeout="auto" language="es-US">` +
        say("Adelante.", "es") +
        `</Gather>` +
        `<Redirect method="POST">${collectUrl(intent === "law_enforcement" ? "law_enforcement" : "general_help")}</Redirect>`
      );
    }
    return twiml(
      say(`${lawEnfMsg}I will be happy to connect you with ${companyName}'s manager.
          Before I do, may I have your name and the reason for your call?
          This way I can let them know who is calling so they are not caught off guard.`) +
      `<Gather input="speech" action="${collectUrl(intent === "law_enforcement" ? "law_enforcement" : "general_help")}" method="POST" timeout="20" speechTimeout="auto" language="en-US">` +
      say("Go right ahead.") +
      `</Gather>` +
      `<Redirect method="POST">${collectUrl(intent === "law_enforcement" ? "law_enforcement" : "general_help")}</Redirect>`
    );
  }

  if (digits === "0") {
    // Trinity AI free-talk with tenant context injected
    return twiml(
      say(lang === "es"
        ? `Conectando con Trinity, la asistente de inteligencia artificial de ${companyName}. Adelante.`
        : `Connecting you with Trinity, ${companyName}'s AI assistant. Go right ahead.`, lang) +
      `<Redirect method="POST">${baseUrl}/api/voice/ai-stream?workspaceId=${encodeURIComponent(tenantWorkspaceId)}&lang=${lang}&sessionId=${encodeURIComponent(sessionId)}</Redirect>`
    );
  }

  // No digit — present the full menu
  const greeting = lang === "es"
    ? `Bienvenido al portal telefónico de ${companyName}, con tecnología de Trinity.
       Estoy aquí para ayudarle a comunicarse con el equipo correcto. Tome su tiempo.
       Si es empleado u oficial de seguridad, marque 1.
       Si es un cliente o contacto de sitio, marque 2.
       Si tiene una emergencia urgente, marque 3.
       Si tiene una queja o inquietud, marque 4.
       Para verificación de empleo, marque 5.
       Para hablar directamente con un responsable, marque 6.
       Para hablar con Trinity, mi asistente de inteligencia artificial, marque cero.
       O simplemente dígame en qué puedo ayudarle.`
    : `Welcome to ${companyName}'s phone portal, powered by Trinity.
       I am here to connect you with the right team. Please take your time.
       If you are a guard or security officer, press 1.
       If you are a client or site contact, press 2.
       If you have an urgent emergency, press 3.
       If you have a complaint or concern, press 4.
       For employment verification, press 5.
       To speak directly with a manager, press 6.
       To speak with Trinity, our AI assistant, press zero.
       Or simply tell me how I can help you today.`;

  const menuAction = `${baseUrl}/api/voice/tenant-menu?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&tenantWorkspaceId=${encodeURIComponent(tenantWorkspaceId)}&company=${encodeURIComponent(companyName)}&intent=${encodeURIComponent(intent)}`;

  return twiml(
    `<Gather input="speech dtmf" numDigits="1" action="${menuAction}" method="POST" timeout="15" speechTimeout="auto" language="${lang === "es" ? "es-US" : "en-US"}" hints="${lang === "es" ? "uno,dos,tres,cuatro,cinco,seis,cero,emergencia,queja,empleado,cliente,manager,supervisor" : "one,two,three,four,five,six,zero,emergency,complaint,employee,client,manager,supervisor"}">` +
    say(greeting, lang) +
    `</Gather>` +
    `<Redirect method="POST">${menuAction}</Redirect>`
  );
}

// ── STEP 4: Collect Caller Info — name + purpose before transfer ──────────────

export async function handleCollectCallerInfo(params: {
  callSid: string;
  sessionId: string;
  tenantWorkspaceId: string;
  companyName: string;
  lang: "en" | "es";
  baseUrl: string;
  intent: CallIntent;
  speechResult: string;
  skipInfo?: boolean;
}): Promise<string> {
  const { callSid, sessionId, tenantWorkspaceId, companyName, lang, baseUrl, intent, speechResult, skipInfo } = params;

  const callerInfo = skipInfo ? "Emergency caller" : (speechResult || "").trim();

  // Store caller info in voice session metadata
  await pool.query(
    `UPDATE voice_call_sessions
     SET metadata = COALESCE(metadata, '{}'::jsonb) ||
       jsonb_build_object('caller_info', $1, 'call_intent', $2)
     WHERE twilio_call_sid = $3`,
    [callerInfo, intent, callSid]
  ).catch(() => {});

  logCallAction({ callSessionId: sessionId, workspaceId: tenantWorkspaceId, action: "caller_info_collected", payload: { intent, callerInfo: callerInfo.slice(0, 100) }, outcome: "success" }).catch(() => {});

  // Confirm what was heard (unless skipped)
  const confirmAndTransferUrl = `${baseUrl}/api/voice/smart-transfer?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&tenantWorkspaceId=${encodeURIComponent(tenantWorkspaceId)}&company=${encodeURIComponent(companyName)}&intent=${encodeURIComponent(intent)}&callerInfo=${encodeURIComponent(callerInfo.slice(0, 200))}`;

  if (skipInfo) {
    return twiml(`<Redirect method="POST">${confirmAndTransferUrl}</Redirect>`);
  }

  if (!callerInfo || callerInfo.length < 3) {
    const reprompt = lang === "es"
      ? `No pude escucharle bien. Por favor diga su nombre y el motivo de su llamada.`
      : `I did not quite catch that. Could you please say your name and the reason for your call?`;
    return twiml(
      say(reprompt, lang) +
      `<Gather input="speech" action="${baseUrl}/api/voice/collect-caller-info?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&tenantWorkspaceId=${encodeURIComponent(tenantWorkspaceId)}&company=${encodeURIComponent(companyName)}&intent=${encodeURIComponent(intent)}" method="POST" timeout="20" speechTimeout="auto" language="${lang === "es" ? "es-US" : "en-US"}">` +
      say(lang === "es" ? "Le escucho." : "Go ahead.", lang) +
      `</Gather>`
    );
  }

  const thankMsg = lang === "es"
    ? `Perfecto. Gracias por esa información. Ahora voy a conectarle con el responsable de ${companyName}. Por favor espere un momento.`
    : `Perfect. Thank you for that information. I am going to connect you with ${companyName}'s manager now. Please hold just one moment.`;

  return twiml(
    say(thankMsg, lang) +
    pause(1) +
    `<Redirect method="POST">${confirmAndTransferUrl}</Redirect>`
  );
}

// ── STEP 5: Smart Transfer — priority waterfall + <Dial> ─────────────────────

export async function handleSmartTransfer(params: {
  callSid: string;
  sessionId: string;
  tenantWorkspaceId: string;
  companyName: string;
  lang: "en" | "es";
  baseUrl: string;
  intent: CallIntent;
  callerInfo: string;
}): Promise<string> {
  const { callSid, sessionId, tenantWorkspaceId, companyName, lang, baseUrl, intent, callerInfo } = params;

  // Run the priority waterfall
  const contact = await resolveOnDutyContact({ workspaceId: tenantWorkspaceId, intent });

  log.info(`[GuestExt] smart-transfer for ${companyName} intent=${intent}: ${contact.found ? contact.name + " (" + contact.role + ")" : "NO CONTACT — " + contact.fallbackReason}`);

  if (!contact.found || !contact.phone) {
    // No one available — take a voicemail
    const noAnswerMsg = lang === "es"
      ? `Lo siento, en este momento no hay nadie disponible en ${companyName} para atenderle directamente.
         Por favor deje su nombre, número de teléfono y el motivo de su llamada después del tono.
         Alguien de ${companyName} se comunicará con usted a la brevedad. Gracias por su paciencia.`
      : `I am sorry, there is no one available at ${companyName} at this moment to take your call directly.
         Please leave your name, phone number, and the reason for your call after the tone.
         Someone from ${companyName} will return your call as soon as possible. Thank you for your patience.`;

    return twiml(
      say(noAnswerMsg, lang) +
      `<Record action="${baseUrl}/api/voice/recording-done?workspaceId=${encodeURIComponent(tenantWorkspaceId)}&sessionId=${encodeURIComponent(sessionId)}" maxLength="180" finishOnKey="#" playBeep="true" />` +
      say(lang === "es"
        ? "Gracias. Su mensaje ha sido guardado y entregado. Que tenga un excelente día."
        : "Thank you. Your message has been saved and delivered. Have a wonderful day.", lang) +
      `<Hangup/>`
    );
  }

  // We have a contact — prepare whisper URL (what Bryan/manager hears before bridging)
  const safeCallerInfo = callerInfo.slice(0, 200);
  const whisperUrl = `${baseUrl}/api/voice/announce-caller?lang=${lang}&intent=${encodeURIComponent(intent)}&company=${encodeURIComponent(companyName)}&callerInfo=${encodeURIComponent(safeCallerInfo)}&contactName=${encodeURIComponent(contact.name || "Manager")}`;
  const transferCompleteUrl = `${baseUrl}/api/voice/transfer-complete?lang=${lang}&sessionId=${encodeURIComponent(sessionId)}&workspaceId=${encodeURIComponent(tenantWorkspaceId)}`;

  logCallAction({ callSessionId: sessionId, workspaceId: tenantWorkspaceId, action: "smart_transfer_initiated", payload: { contact: contact.name, role: contact.role, intent, isOnDuty: contact.isOnDuty }, outcome: "dialing" }).catch(() => {});

  const connectMsg = lang === "es"
    ? `Conectando con ${contact.isOnDuty ? "el responsable de turno de" : "el administrador de"} ${companyName} ahora mismo. Por favor espere.`
    : `Connecting you with ${companyName}'s ${contact.isOnDuty ? "on-duty manager" : contact.role || "manager"} right now. Please hold.`;

  return twiml(
    say(connectMsg, lang) +
    `<Dial callerId="${process.env.TWILIO_PHONE_NUMBER || ""}" timeout="30" action="${transferCompleteUrl}" method="POST">` +
    `<Number url="${whisperUrl}" method="GET">${contact.phone}</Number>` +
    `</Dial>`
  );
}

// ── STEP 6: Announce Caller — whisper to recipient before bridging ────────────

export function handleAnnounceCaller(params: {
  lang: "en" | "es";
  intent: string;
  companyName: string;
  callerInfo: string;
  contactName: string;
}): string {
  const { lang, intent, companyName, callerInfo, contactName } = params;

  const intentLabel: Record<string, string> = {
    complaint: "a complaint",
    compliment: "a compliment",
    law_enforcement: "a law enforcement inquiry",
    legal: "a legal matter",
    guard_issue: "a staff question",
    emergency: "an emergency",
    general_help: "a general inquiry",
    unknown: "an inquiry",
  };
  const intentLabel_es: Record<string, string> = {
    complaint: "una queja",
    compliment: "un cumplido",
    law_enforcement: "una consulta policial",
    legal: "un asunto legal",
    guard_issue: "una pregunta del personal",
    emergency: "una emergencia",
    general_help: "una consulta general",
    unknown: "una consulta",
  };

  const label = lang === "es" ? (intentLabel_es[intent] || "una consulta") : (intentLabel[intent] || "an inquiry");
  const name = contactName || "there";

  const announcement = lang === "es"
    ? `Hola ${name}, soy Trinity, el sistema de inteligencia artificial de ${companyName}.
       Tengo a una persona en la línea que llama con ${label}.
       Ellos dijeron: ${callerInfo || "no proporcionaron más detalles"}.
       Voy a conectarles ahora y me retiro de la conversación. Que tenga un excelente día.`
    : `Hello ${name}, this is Trinity, ${companyName}'s AI assistant.
       I have someone on the line calling with ${label}.
       They said: ${callerInfo || "no additional details provided"}.
       I will connect you both now and step out of the conversation. Have a great day.`;

  // This TwiML plays ONLY to the recipient (Bryan) before the call bridges
  return twiml(say(announcement, lang) + pause(1));
}

// ── STEP 7: Transfer Complete — Twilio callback after <Dial> ends ─────────────

export function handleTransferComplete(params: {
  lang: "en" | "es";
  dialCallStatus: string;
  sessionId: string;
  workspaceId: string;
  baseUrl: string;
}): string {
  const { lang, dialCallStatus, sessionId, workspaceId, baseUrl } = params;

  logCallAction({ callSessionId: sessionId, workspaceId, action: "transfer_complete", payload: { dialCallStatus }, outcome: dialCallStatus === "completed" ? "success" : "failed" }).catch(() => {});

  if (dialCallStatus === "completed" || dialCallStatus === "answered") {
    return twiml(`<Hangup/>`);
  }

  // Manager did not answer — offer voicemail
  const noAnswerMsg = lang === "es"
    ? `Lo siento, la línea no está disponible en este momento. Por favor deje un mensaje después del tono y nos comunicaremos con usted a la brevedad.`
    : `I am sorry, the line is not available right now. Please leave a message after the tone and someone will return your call very soon.`;

  return twiml(
    say(noAnswerMsg, lang) +
    `<Record action="${baseUrl}/api/voice/recording-done?workspaceId=${encodeURIComponent(workspaceId)}&sessionId=${encodeURIComponent(sessionId)}" maxLength="180" finishOnKey="#" playBeep="true" />` +
    say(lang === "es"
      ? "Gracias. Su mensaje fue guardado. Que tenga un buen día."
      : "Thank you. Your message has been saved. Have a great day.", lang) +
    `<Hangup/>`
  );
}
