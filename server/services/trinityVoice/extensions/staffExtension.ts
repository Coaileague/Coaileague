/**
 * STAFF EXTENSION — Trinity Voice Phone System
 * Extension 4: Staff self-service (clock-in, calloffs, support)
 *
 * Sub-options:
 *   4.1 — Voice Clock-In (PIN authenticated)
 *   4.2 — Submit a Call-Off
 *   4.3 — Staff Support / Leave a message
 */

import { db } from '../../../db';
import { employees } from '../../../../shared/schema/domains/workforce';
import { workspaceMembers } from '../../../../shared/schema/domains/orgs';
import { shifts } from '../../../../shared/schema/domains/scheduling';
import { timeEntries } from '../../../../shared/schema/domains/time';
import {
  voiceCallSessions,
  voiceVerificationLog,
} from '../../../../shared/schema/domains/voice';
import { eq, and, gte, lte, isNull, inArray } from 'drizzle-orm';
import { twiml, logCallAction, updateCallSession } from '../voiceOrchestrator';
import { platformEventBus } from '../../platformEventBus';
import { verifyClockInPin } from '../clockInPinService';
import { createLogger } from '../../../lib/logger';
import { scheduleNonBlocking } from '../../../lib/scheduleNonBlocking';
const log = createLogger('staffExtension');


const say = (text: string, lang: 'en' | 'es' = 'en') =>
  lang === 'es'
    ? `<Say voice="Polly.Lupe-Neural" language="es-US">${text}</Say>`
    : `<Say voice="Polly.Joanna-Neural" language="en-US">${text}</Say>`;

function gather(opts: { action: string; numDigits?: number; timeout?: number; input?: string; speechTimeout?: string }, children: string): string {
  const attrs = [
    `action="${opts.action}"`,
    'method="POST"',
    `timeout="${opts.timeout ?? 10}"`,
    opts.numDigits !== undefined ? `numDigits="${opts.numDigits}"` : '',
    opts.input ? `input="${opts.input}"` : 'input="dtmf"',
  ].filter(Boolean).join(' ');
  return `<Gather ${attrs}>${children}</Gather>`;
}

// ─── Staff Main Menu ──────────────────────────────────────────────────────────

export function handleStaff(params: {
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
    payload: { extension: '4', label: 'staff' },
    outcome: 'success',
  }).catch((err) => log.warn('[staffExtension] Fire-and-forget failed:', err));

  const qs = `callSid=${params.callSid}&sessionId=${sessionId}&workspaceId=${workspaceId}&lang=${lang}`;

  if (lang === 'es') {
    return twiml(
      gather({ action: `${baseUrl}/api/voice/staff-menu?${qs}`, numDigits: 1 },
        say('Menú de Personal. Para registrar su entrada, marque 1. ' +
          'Para reportar una ausencia, marque 2. ' +
          'Para soporte de personal, marque 3.', 'es')
      ) +
      `<Redirect method="POST">${baseUrl}/api/voice/staff-menu?${qs}</Redirect>`
    );
  }

  return twiml(
    gather({ action: `${baseUrl}/api/voice/staff-menu?${qs}`, numDigits: 1 },
      say('Staff Menu. To clock in, press 1. ' +
        'To report a call-off, press 2. ' +
        'For staff support, press 3.')
    ) +
    `<Redirect method="POST">${baseUrl}/api/voice/staff-menu?${qs}</Redirect>`
  );
}

// ─── Voice Clock-In — Step 1: Collect Employee Number ────────────────────────

export function handleClockInStep1(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  baseUrl: string;
}): string {
  const { callSid, sessionId, workspaceId, lang, baseUrl } = params;
  const qs = `callSid=${callSid}&sessionId=${sessionId}&workspaceId=${workspaceId}&lang=${lang}`;

  if (lang === 'es') {
    return twiml(
      gather({
        action: `${baseUrl}/api/voice/clock-in-pin?${qs}`,
        numDigits: 10,
        timeout: 15,
        input: 'dtmf speech',
        speechTimeout: 'auto',
      },
        say('Por favor ingrese o diga su número de empleado seguido del numeral.', 'es')
      ) +
      say('No se recibió ninguna entrada. Adiós.', 'es')
    );
  }

  return twiml(
    gather({
      action: `${baseUrl}/api/voice/clock-in-pin?${qs}`,
      numDigits: 10,
      timeout: 15,
      input: 'dtmf speech',
      speechTimeout: 'auto',
    },
      say('Please enter or say your employee number followed by the pound key.')
    ) +
    say('No entry received. Goodbye.')
  );
}

// ─── Voice Clock-In — Step 2: Collect PIN ────────────────────────────────────

export function handleCollectPin(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  baseUrl: string;
  employeeNumber: string;
}): string {
  const { callSid, sessionId, workspaceId, lang, baseUrl, employeeNumber } = params;
  const qs = `callSid=${callSid}&sessionId=${sessionId}&workspaceId=${workspaceId}&lang=${lang}&employeeNumber=${encodeURIComponent(employeeNumber)}`;

  if (lang === 'es') {
    return twiml(
      gather({ action: `${baseUrl}/api/voice/clock-in-verify?${qs}`, numDigits: 6, timeout: 15 },
        say('Ingrese su PIN de 6 dígitos.', 'es')
      ) +
      say('No se recibió el PIN. Adiós.', 'es')
    );
  }

  return twiml(
    gather({ action: `${baseUrl}/api/voice/clock-in-verify?${qs}`, numDigits: 6, timeout: 15 },
      say('Please enter your 6-digit clock-in PIN.')
    ) +
    say('No PIN received. Goodbye.')
  );
}

// ─── Voice Clock-In — Step 3: Verify & Process ───────────────────────────────

export async function processClockIn(params: {
  callSid: string;
  sessionId: string;
  workspaceId: string;
  lang: 'en' | 'es';
  employeeNumber: string;
  pin: string;
}): Promise<string> {
  const { callSid, sessionId, workspaceId, lang, employeeNumber, pin } = params;

  const logVerification = async (employeeId: string | null, outcome: string, failedAttempts = 0) => {
    await db.insert(voiceVerificationLog).values({
      workspaceId,
      callSessionId: sessionId,
      employeeId,
      employeeNumber,
      verificationType: 'clock_in_pin',
      outcome,
      failedAttempts,
    }).catch((err) => log.warn('[staffExtension] Fire-and-forget failed:', err));
  };

  // 1–3. Look up employee and verify PIN via shared Phase 57 clock-in PIN service.
  // Try exact employee number first; if all-digit input also try EMP-NNN canonical format.
  const lookupCandidates: string[] = [employeeNumber];
  if (/^\d+$/.test(employeeNumber)) {
    lookupCandidates.push(`EMP-${employeeNumber.padStart(3, '0')}`);
    lookupCandidates.push(`EMP-${employeeNumber}`);
  }

  let pinResult = await verifyClockInPin(workspaceId, lookupCandidates[0], pin);
  for (let i = 1; i < lookupCandidates.length && !pinResult.valid && pinResult.reason === 'no_employee'; i++) {
    pinResult = await verifyClockInPin(workspaceId, lookupCandidates[i], pin);
  }

  if (pinResult.reason === 'no_employee') {
    await logVerification(null, 'no_employee_found');
    return lang === 'es'
      ? twiml(say('No se encontró ningún empleado con ese número. Por favor verifique e intente nuevamente. Adiós.', 'es'))
      : twiml(say('No employee found with that number. Please verify and try again. Goodbye.'));
  }

  if (pinResult.reason === 'no_pin') {
    await logVerification(pinResult.employee?.id ?? null, 'no_pin_set');
    return lang === 'es'
      ? twiml(say('No tiene un PIN configurado. Por favor contacte a su supervisor para configurar su PIN de voz. Adiós.', 'es'))
      : twiml(say('You do not have a clock-in PIN set. Please contact your supervisor to set up your voice PIN. Goodbye.'));
  }

  if (!pinResult.valid) {
    await logVerification(pinResult.employee?.id ?? null, 'failure', 1);
    return lang === 'es'
      ? twiml(say('PIN incorrecto. Por favor intente de nuevo. Adiós.', 'es'))
      : twiml(say('Incorrect PIN. Please try again. Goodbye.'));
  }

  // PIN verified — resolve full employee record for guard card check and shift lookup
  const [employee] = await db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    employeeNumber: employees.employeeNumber,
    clockinPinHash: employees.clockinPinHash,
    isActive: employees.isActive,
    workspaceId: employees.workspaceId,
    guardCardExpiryDate: employees.guardCardExpiryDate,
    guardCardVerified: employees.guardCardVerified,
  })
    .from(employees)
    .where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.id, pinResult.employee!.id),
    ))
    .limit(1);

  if (!employee) {
    await logVerification(null, 'no_employee_found');
    return lang === 'es'
      ? twiml(say('No se encontró el empleado. Adiós.', 'es'))
      : twiml(say('Employee record not found. Goodbye.'));
  }

  // 3.5 License expiry check — block clock-in if guard card is expired
  if (employee.guardCardVerified && employee.guardCardExpiryDate) {
    const expiry = new Date(employee.guardCardExpiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiry < today) {
      await logVerification(employee.id, 'license_expired');
      await logCallAction({
        callSessionId: sessionId,
        workspaceId,
        action: 'clock_in_blocked',
        payload: { reason: 'guard_card_expired', expiryDate: employee.guardCardExpiryDate },
        outcome: 'failure',
      });
      return lang === 'es'
        ? twiml(say(
            `Lo sentimos, ${employee.firstName}. Su licencia de guardia de seguridad ha vencido y no puede registrar entrada. ` +
            'Por favor contacte a su supervisor para renovar su credencial. Adiós.', 'es'
          ))
        : twiml(say(
            `Sorry, ${employee.firstName}. Your security guard license has expired and you cannot clock in. ` +
            'Please contact your supervisor to renew your credentials. Goodbye.'
          ));
    }
  }

  // 4. Find today's scheduled shift
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const [todayShift] = await db.select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.employeeId, employee.id),
      gte(shifts.startTime, todayStart),
      lte(shifts.startTime, todayEnd),
    ))
    .limit(1);

  // 4.5 Shift enforcement — reject if no scheduled shift exists today
  // The IVR cannot accept supervisor override; only in-person supervisors can approve unscheduled clock-ins.
  if (!todayShift) {
    await logVerification(employee.id, 'no_shift_scheduled');
    await logCallAction({
      callSessionId: sessionId,
      workspaceId,
      action: 'clock_in_blocked',
      payload: { reason: 'no_shift_scheduled', date: now.toISOString().slice(0, 10) },
      outcome: 'failure',
    });
    return lang === 'es'
      ? twiml(say(
          `Lo sentimos, ${employee.firstName}. No tiene un turno programado para hoy. ` +
          'Si cree que esto es un error, comuníquese con su supervisor para autorización manual. Adiós.', 'es'
        ))
      : twiml(say(
          `Sorry, ${employee.firstName}. You do not have a scheduled shift for today. ` +
          'If you believe this is an error, please contact your supervisor for manual authorization. Goodbye.'
        ));
  }

  // 5. Check for existing open time entry
  const [openEntry] = await db.select()
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.employeeId, employee.id),
      isNull(timeEntries.clockOut),
    ))
    .limit(1);

  if (openEntry) {
    await logVerification(employee.id, 'already_clocked_in');
    const ref = openEntry.referenceId || openEntry.id.slice(-6).toUpperCase();
    return lang === 'es'
      ? twiml(say(`Usted ya está registrado en el sistema. Su referencia es ${ref.split('').join(' ')}. Adiós.`, 'es'))
      : twiml(say(`You are already clocked in. Your reference is ${ref.split('').join(' ')}. Goodbye.`));
  }

  // 6. Generate reference ID: CLK-YYYYMMDD-NNNNN
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  const referenceId = `CLK-${dateStr}-${seq}`;

  // 7. Create time entry
  const [timeEntry] = await db.insert(timeEntries).values({
    workspaceId,
    employeeId: employee.id,
    shiftId: todayShift?.id ?? null,
    clientId: todayShift?.clientId ?? null,
    clockIn: now,
    clockInMethod: 'voice_phone',
    referenceId,
    trinityAssistedClockin: true,
    trinityClockInReason: 'Voice phone clock-in via Trinity IVR',
    status: 'pending',
  }).returning();

  // 8. Update call session
  await updateCallSession(callSid, {
    clockInEmployeeId: employee.id,
    clockInReferenceId: referenceId,
    clockInSuccess: true,
  });

  // 8b. Broadcast dashboard event so live dashboard updates without a manual refresh
  setImmediate(() => {
    platformEventBus.publish({
      type: 'officer_clocked_in',
      category: 'field_operations',
      title: 'Officer Clocked In',
      description: `${employee.firstName} ${employee.lastName} clocked in via Voice IVR`,
      workspaceId,
      metadata: {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        timeEntryId: timeEntry.id,
        shiftId: todayShift?.id ?? null,
        referenceId,
        method: 'voice_phone',
        timestamp: now.toISOString(),
      },
    });
  });

  // 9. Log successful verification
  await logVerification(employee.id, 'success');

  // 10. Log clock-in action
  await logCallAction({
    callSessionId: sessionId,
    workspaceId,
    action: 'clock_in',
    payload: {
      employeeId: employee.id,
      referenceId,
      shiftId: todayShift?.id ?? null,
    },
    outcome: 'success',
  });

  // 11. Notify supervisors/managers asynchronously
  // Find workspace members with manager/supervisor/owner roles to notify
  scheduleNonBlocking('voice-clock-in.manager-notify', async () => {
    const managerRoles = ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'department_manager', 'supervisor'];
    const managers = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, 'active'),
        inArray(workspaceMembers.role, managerRoles),
      ))
      .limit(5);

    if (managers.length > 0) {
      const { NotificationDeliveryService } = await import('../../notificationDeliveryService');
      await Promise.allSettled(managers.map(m =>
        NotificationDeliveryService.send({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          type: 'clock_in_notification',
          workspaceId,
          recipientUserId: m.userId,
          channel: 'in_app',
          subject: `Voice Clock-In — ${employee.firstName} ${employee.lastName}`,
          body: {
            title: 'Employee Clocked In via Voice',
            message: `${employee.firstName} ${employee.lastName} clocked in via voice phone. Reference: ${referenceId}`,
            actionUrl: '/time-tracking',
            referenceId,
          },
          idempotencyKey: `voice-clockin-${referenceId}-${m.userId}`,
        })
      ));
    }
  });

  // 12. Speak confirmation
  const nameForVoice = employee.firstName;
  const refForVoice = referenceId.split('').join(' ');

  if (lang === 'es') {
    return twiml(
      say(`Entrada registrada exitosamente. Bienvenido ${nameForVoice}. ` +
        `Su número de referencia es ${refForVoice}. ` +
        `Por favor anote este número. Que tenga un buen turno. Adiós.`, 'es')
    );
  }

  return twiml(
    say(`Clock-in successful. Welcome ${nameForVoice}. ` +
      `Your reference number is ${refForVoice}. ` +
      `Please note this number. Have a great shift. Goodbye.`)
  );
}

// ─── Calloff (Staff 4.2) ──────────────────────────────────────────────────────

export function handleCallOff(params: {
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
    action: 'calloff_initiated',
    payload: {},
    outcome: 'in_progress',
  }).catch((err) => log.warn('[staffExtension] Fire-and-forget failed:', err));

  if (lang === 'es') {
    return twiml(
      say('Para reportar una ausencia, por favor deje su nombre, número de empleado y la fecha del turno al que no puede asistir después del tono.', 'es') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=calloff&lang=es" maxLength="120" playBeep="true" />` +
      say('Su reporte de ausencia ha sido registrado. Un supervisor fue notificado. Adiós.', 'es')
    );
  }

  return twiml(
    say('To report a call-off, please leave your name, employee number, and the date of the shift you cannot work after the tone.') +
    `<Record action="${baseUrl}/api/voice/recording-done?ext=calloff&lang=en" maxLength="120" playBeep="true" />` +
    say('Your call-off has been recorded. A supervisor has been notified. Goodbye.')
  );
}

// ─── Staff Support (Staff 4.3) ────────────────────────────────────────────────

export function handleStaffSupport(params: {
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
    action: 'staff_support_initiated',
    payload: {},
    outcome: 'in_progress',
  }).catch((err) => log.warn('[staffExtension] Fire-and-forget failed:', err));

  if (lang === 'es') {
    return twiml(
      say('Ha seleccionado Soporte de Personal. Por favor deje su nombre, número de empleado y su consulta después del tono.', 'es') +
      `<Record action="${baseUrl}/api/voice/recording-done?ext=staff-support&lang=es" maxLength="180" playBeep="true" />` +
      say('Su mensaje ha sido recibido. Nos comunicaremos con usted pronto. Adiós.', 'es')
    );
  }

  return twiml(
    say('You have selected Staff Support. Please leave your name, employee number, and your question after the tone.') +
    `<Record action="${baseUrl}/api/voice/recording-done?ext=staff-support&lang=en" maxLength="180" playBeep="true" />` +
    say('Your message has been received. We will follow up with you shortly. Goodbye.')
  );
}
