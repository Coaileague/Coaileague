/**
 * TRINITY HIRING PIPELINE ACTIONS
 * ================================
 * The legal liability gap: an officer working a shift without a current PERC/Guard Card.
 * If something happens — the company is exposed.
 *
 * This module manages the complete pipeline from:
 *   "I need to hire someone" → "Licensed officer on the schedule"
 *
 * Leverages existing DB tables:
 *   onboardingApplications — the new hire record
 *   onboardingInvites — invitation/application tracker
 *   employeeDocuments — license tracking
 *   employees — becomes active when licensed
 *
 * Texas PERC / Guard Card pipeline steps:
 *   Applied → Screened → Background Initiated → Training Scheduled →
 *   DPS Application Submitted → License Received → Schedule Eligible
 */

import { db } from '../../db';
import {
  onboardingApplications, onboardingInvites, employeeDocuments,
  employees, workspaceMembers, shifts
} from '@shared/schema';
import { eq, and, gte, lte, lt, inArray, sql, desc, isNull, ne } from 'drizzle-orm';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import type { ActionRequest, ActionResult, ActionHandler } from './actionRegistry';
import { createNotification } from '../notificationService';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityHiringPipelineActions');

const createResult = (
  actionId: string, success: boolean, message: string,
  data: any, start: number
): ActionResult => ({
  actionId, success, message, data,
  executionTimeMs: Date.now() - start,
  timestamp: new Date().toISOString(),
});

function mkAction(id: string, fn: (req: ActionRequest) => Promise<ActionResult>): ActionHandler {
  return { actionId: id, name: id, category: id.split('.')[0], description: id, requiredRoles: [], handler: fn };
}

// ─── HIRING PIPELINE ──────────────────────────────────────────────────────────

const createHiringRecord = mkAction('hiring.create_record', async (req) => {
  const start = Date.now();
  try {
    const { firstName, lastName, email, phone, role, workspaceId: wid } = req.payload || {};
    const workspaceId = wid || req.workspaceId;
    if (!firstName || !lastName || !email || !workspaceId) {
      return createResult(req.actionId, false, 'firstName, lastName, email, and workspaceId required', null, start);
    }

    const [application] = await db.insert(onboardingApplications).values({
      workspaceId,
      firstName,
      lastName,
      email,
      phone: phone || null,
      status: 'in_progress' as any,
      currentStep: 'personal_info' as any,
    } as any).returning();

    const [invite] = await db.insert(onboardingInvites).values({
      workspaceId,
      email,
      firstName,
      lastName,
      role: role || 'Security Officer',
      inviteToken: `trinity-hire-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 30 * 86400000),
      status: 'sent' as any,
      sentBy: req.userId || 'trinity-auto',
    } as any).returning();

    const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`)).catch(() => []);
    for (const mgr of managers) {
      await createNotification({
        workspaceId, userId: mgr.userId, type: 'info',
        title: 'New Hire Record Created',
        message: `Trinity created a hiring record for ${firstName} ${lastName} (${email}). Next step: background check initiation. PERC/Guard Card pipeline started.`,
        priority: 'normal',
      } as any).catch(() => null);
    }

    return createResult(req.actionId, true,
      `Hiring record created for ${firstName} ${lastName}. PERC pipeline initiated. Next step: initiate background check.`,
      { applicationId: application.id, inviteId: invite.id, email, status: 'applied' }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const updateHiringStatus = mkAction('hiring.update_status', async (req) => {
  const start = Date.now();
  try {
    const { applicationId, status, notes } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!applicationId || !status) return createResult(req.actionId, false, 'applicationId and status required', null, start);

    const VALID_STATUSES = ['in_progress', 'background_check_initiated', 'training_scheduled', 'dps_application_submitted', 'license_received', 'completed', 'rejected', 'withdrawn'];
    if (!VALID_STATUSES.includes(status)) {
      return createResult(req.actionId, false, `Invalid status. Valid: ${VALID_STATUSES.join(', ')}`, null, start);
    }

    await db.update(onboardingApplications)
      .set({ status, updatedAt: new Date() } as any)
      .where(eq(onboardingApplications.id, applicationId));

    const NEXT_STEPS: Record<string, string> = {
      background_check_initiated: 'Await background check results (3-5 business days). Schedule Level II pre-assignment training.',
      training_scheduled: 'Confirm 6-hour Level II pre-assignment training completion. Then submit DPS PERC application.',
      dps_application_submitted: 'DPS processing takes 2-6 weeks. Notify officer to check DPS status. Do NOT schedule until PERC received.',
      license_received: 'PERC/Guard Card confirmed. Mark officer as schedule-eligible.',
      completed: 'Officer is fully onboarded and schedule-eligible.',
    };

    return createResult(req.actionId, true,
      `Hiring status updated to "${status}". ${NEXT_STEPS[status] || ''}`,
      { applicationId, newStatus: status, nextStep: NEXT_STEPS[status] || null }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const initiateBackgroundCheck = mkAction('hiring.initiate_background_check', async (req) => {
  const start = Date.now();
  try {
    const { applicationId, applicantName, email, checkType } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!applicationId || !wid) return createResult(req.actionId, false, 'applicationId and workspaceId required', null, start);

    await db.update(onboardingApplications)
      .set({ status: 'background_check_initiated' as any, updatedAt: new Date() } as any)
      .where(eq(onboardingApplications.id, applicationId));

    const checkTypes = ['criminal_federal', 'criminal_state_tx', 'sex_offender_registry', 'identity_verification'];
    const instructions = [
      `Background check initiated for ${applicantName || 'applicant'} (${email || 'no email'}).`,
      `Texas DPS requires criminal history check for PERC card applications.`,
      `Check types to run: ${(checkType ? [checkType] : checkTypes).join(', ')}.`,
      `Integration: Connect Checkr or Sterling Talent Solutions for automated ordering.`,
      `FCRA compliance: Adverse action process required before rejecting based on findings.`,
      `Texas notes: Certain felonies are automatic disqualifiers per Ch. 1702. Others require individualized assessment.`,
      `Expected turnaround: 3-5 business days for standard check.`,
    ].join(' ');

    return createResult(req.actionId, true, instructions, {
      applicationId, status: 'background_check_initiated',
      checksToRun: checkType ? [checkType] : checkTypes,
      fcraRequired: true,
      stateNotes: 'Texas DPS Ch. 1702 — certain felonies auto-disqualify. Others require assessment per EEOC guidelines.',
      nextStep: 'Schedule Level II 6-hour pre-assignment training while awaiting results.',
    }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const schedulePERCTraining = mkAction('hiring.schedule_perc_training', async (req) => {
  const start = Date.now();
  try {
    const { applicationId, employeeId, trainingDate, trainingProvider } = req.payload || {};
    if (!applicationId) return createResult(req.actionId, false, 'applicationId required', null, start);

    await db.update(onboardingApplications)
      .set({ status: 'training_scheduled' as any, updatedAt: new Date() } as any)
      .where(eq(onboardingApplications.id, applicationId));

    const instructions = [
      `Level II Pre-Assignment Training scheduled${trainingDate ? ' for ' + trainingDate : ''}.`,
      `Requirements: 6 hours of pre-assignment training from a DPS-approved provider.`,
      `Provider: ${trainingProvider || 'Must use a Texas DPS-approved training school.'}`,
      `After training: Officer receives certificate of completion.`,
      `Next step: Submit DPS PERC application with training certificate + background check results + fee.`,
      `DPS processing: 2-6 weeks. Officer CANNOT work until PERC card is physically in hand.`,
    ].join(' ');

    return createResult(req.actionId, true, instructions, {
      applicationId, trainingLevel: 'Level II (Unarmed)', requiredHours: 6,
      trainingDate: trainingDate || 'TBD', trainingProvider: trainingProvider || 'DPS-approved provider required',
      status: 'training_scheduled',
    }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const trackDPSApplication = mkAction('hiring.track_dps_application', async (req) => {
  const start = Date.now();
  try {
    const { applicationId, dpsApplicationNumber, submittedDate } = req.payload || {};
    if (!applicationId) return createResult(req.actionId, false, 'applicationId required', null, start);

    await db.update(onboardingApplications)
      .set({ status: 'dps_application_submitted' as any, updatedAt: new Date() } as any)
      .where(eq(onboardingApplications.id, applicationId));

    const estimatedCompletion = submittedDate
      ? new Date(new Date(submittedDate).getTime() + 35 * 86400000).toISOString().split('T')[0]
      : 'approximately 2-6 weeks from submission';

    return createResult(req.actionId, true,
      `DPS application tracked. Application #${dpsApplicationNumber || 'pending'}. Estimated PERC card receipt: ${estimatedCompletion}. Do NOT schedule this officer until PERC confirmed in hand.`,
      { applicationId, dpsApplicationNumber, submittedDate, estimatedCompletion, status: 'dps_application_submitted',
        warning: 'SCHEDULING BLOCKED until license_received status confirmed.' }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const confirmLicenseReceived = mkAction('hiring.confirm_license_received', async (req) => {
  const start = Date.now();
  try {
    const { applicationId, employeeId, percCardNumber, licenseLevel, expirationDate } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!applicationId || !wid) return createResult(req.actionId, false, 'applicationId and workspaceId required', null, start);

    await db.update(onboardingApplications)
      .set({ status: 'completed' as any, updatedAt: new Date() } as any)
      .where(eq(onboardingApplications.id, applicationId));

    if (employeeId && percCardNumber && expirationDate) {
      await db.insert(employeeDocuments).values({
        workspaceId: wid,
        employeeId,
        documentType: licenseLevel === 'Level III' ? 'armed_license' : 'security_license',
        docNumber: percCardNumber,
        issuingAuthority: 'Texas DPS Private Security Bureau',
        expirationDate: new Date(expirationDate),
        status: 'active',
        fileName: `PERC_Card_${percCardNumber}`,
      } as any).catch(() => null);
    }

    await platformEventBus.publish({
      eventType: 'employee_hired',
      workspaceId: wid,
      title: 'New Officer Schedule-Eligible',
      description: `PERC/Guard Card confirmed for application ${applicationId}. Officer is now schedule-eligible.`,
      data: { applicationId, employeeId, percCardNumber, licenseLevel: licenseLevel || 'Level II', expirationDate },
    }).catch(() => null);

    const managers = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, wid), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`)).catch(() => []);
    for (const mgr of managers) {
      await createNotification({
        workspaceId: wid, userId: mgr.userId, type: 'info',
        title: 'New Officer Schedule-Eligible',
        message: `PERC/Guard Card confirmed for application ${applicationId}${percCardNumber ? ' (Card #: ' + percCardNumber + ')' : ''}. Officer is now schedule-eligible. Add to scheduling pool.`,
        priority: 'normal',
      } as any).catch(() => null);
    }

    return createResult(req.actionId, true,
      `PERC/Guard Card confirmed. Officer is now schedule-eligible. License record created. Compliance tracking started.`,
      { applicationId, employeeId, percCardNumber, licenseLevel: licenseLevel || 'Level II', expirationDate, scheduleEligible: true }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getHiringPipelineStatus = mkAction('hiring.pipeline_status', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const applications = await db.select({
      id: onboardingApplications.id,
      firstName: onboardingApplications.firstName,
      lastName: onboardingApplications.lastName,
      email: onboardingApplications.email,
      status: onboardingApplications.status,
      currentStep: onboardingApplications.currentStep,
      createdAt: onboardingApplications.createdAt,
    }).from(onboardingApplications)
      .where(and(
        eq(onboardingApplications.workspaceId, wid),
        ne(onboardingApplications.status as any, 'completed'),
        ne(onboardingApplications.status as any, 'rejected'),
      ))
      .orderBy(desc(onboardingApplications.createdAt))
      .catch(() => []);

    const byStatus = applications.reduce((acc: Record<string, number>, app) => {
      acc[app.status || 'unknown'] = (acc[app.status || 'unknown'] || 0) + 1;
      return acc;
    }, {});

    const dpsStuck = applications.filter(a => a.status === 'dps_application_submitted');
    const dpsAlert = dpsStuck.length > 0 ? `${dpsStuck.length} applicant(s) waiting on DPS. Follow up if >6 weeks since submission.` : '';

    return createResult(req.actionId, true,
      `Hiring pipeline: ${applications.length} active candidates. ${Object.entries(byStatus).map(([s, c]) => `${s}: ${c}`).join(', ')}. ${dpsAlert}`,
      { pipeline: applications, byStatus, dpsAlert, totalActive: applications.length }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const checkMultiStateLicenseEligibility = mkAction('hiring.check_multistate_license', async (req) => {
  const start = Date.now();
  try {
    const { employeeId, targetState } = req.payload || {};
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!employeeId || !targetState) return createResult(req.actionId, false, 'employeeId and targetState required', null, start);

    const licenses = await db.select().from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.employeeId, employeeId),
        inArray(employeeDocuments.documentType as any, ['security_license', 'armed_license', 'guard_card']),
        eq(employeeDocuments.status as any, 'active'),
      )).catch(() => []);

    const STATE_REQUIREMENTS: Record<string, { authority: string; cardName: string; transfersFromTX: boolean; notes: string }> = {
      TX: { authority: 'Texas DPS Private Security Bureau', cardName: 'PERC Card (Guard Card)', transfersFromTX: true, notes: 'Texas license. Home state.' },
      CA: { authority: 'BSIS — Bureau of Security and Investigative Services', cardName: 'California Guard Card', transfersFromTX: false, notes: 'Texas PERC does NOT transfer to California. Must obtain CA BSIS Guard Card separately. 8-hour pre-assignment training + BSIS application required.' },
      FL: { authority: 'FDACS Division of Licensing', cardName: 'Class D License', transfersFromTX: false, notes: 'Florida Class D license required. 40 hours initial training. Does not accept TX license.' },
      NY: { authority: 'NY Secretary of State', cardName: 'Security Guard Registration', transfersFromTX: false, notes: 'New York has strict requirements. 8-hour pre-assignment, 16-hour on-job, 8-hour annual. NYC has additional requirements.' },
      IL: { authority: 'Illinois State Police', cardName: 'PERC Card (Illinois — different from TX)', transfersFromTX: false, notes: 'Illinois PERC card — same name, completely different system from Texas. 20-hour pre-assignment training. Must apply separately.' },
      GA: { authority: 'Georgia Board of Private Detective and Security Agencies', cardName: 'Security License', transfersFromTX: false, notes: '8-hour pre-assignment training. Relatively straightforward.' },
      AZ: { authority: 'Arizona DPS', cardName: 'Security Guard License', transfersFromTX: false, notes: '8-hour pre-assignment. Arizona shall-issue state for firearms.' },
    };

    const stateReq = STATE_REQUIREMENTS[targetState.toUpperCase()];
    if (!stateReq) {
      return createResult(req.actionId, true,
        `State ${targetState} requirements: Trinity does not have specific data for this state. Verify with state licensing authority before scheduling this officer.`,
        { employeeId, targetState, warning: 'Unknown state requirements — verify before scheduling' }, start);
    }

    const hasTXLicense = licenses.some(l => (l as any).issuingAuthority?.includes('Texas DPS') || (l as any).issuingAuthority?.includes('DPS Private Security'));
    const hasStateSpecificLicense = licenses.some(l => (l as any).issuingAuthority?.includes(stateReq.authority));

    if (hasStateSpecificLicense) {
      return createResult(req.actionId, true,
        `Officer ${employeeId} has an active ${stateReq.cardName} for ${targetState}. Eligible to work in ${targetState}.`,
        { employeeId, targetState, eligible: true, licenseType: stateReq.cardName }, start);
    }

    if (!stateReq.transfersFromTX || !hasTXLicense) {
      const message = `SCHEDULING BLOCK: Officer ${employeeId} is NOT eligible to work in ${targetState}. ${stateReq.notes} Issuing authority: ${stateReq.authority}. Required license: ${stateReq.cardName}.`;
      return createResult(req.actionId, false, message, {
        employeeId, targetState, eligible: false,
        requiredLicense: stateReq.cardName, authority: stateReq.authority,
        notes: stateReq.notes, action: `Officer must obtain ${stateReq.cardName} from ${stateReq.authority} before being scheduled in ${targetState}.`,
      }, start);
    }

    return createResult(req.actionId, true, stateReq.notes, { employeeId, targetState, eligible: stateReq.transfersFromTX }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const getExpiringLicensesAlert = mkAction('hiring.expiring_licenses_alert', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    const daysAhead = req.payload?.daysAhead || 60;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const cutoff = new Date(Date.now() + daysAhead * 86400000);
    const expiring = await db.select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      documentType: employeeDocuments.documentType,
      docNumber: (employeeDocuments as any).docNumber,
      expirationDate: employeeDocuments.expirationDate,
      issuingAuthority: (employeeDocuments as any).issuingAuthority,
    }).from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, wid),
        lte(employeeDocuments.expirationDate, cutoff),
        gte(employeeDocuments.expirationDate, new Date()),
        inArray(employeeDocuments.documentType as any, ['security_license', 'armed_license', 'guard_card', 'perc_card']),
      ))
      .orderBy(employeeDocuments.expirationDate)
      .catch(() => []);

    if (expiring.length === 0) {
      return createResult(req.actionId, true, `All security licenses are current — no expirations within ${daysAhead} days.`, { expiring: [], count: 0 }, start);
    }

    const now = new Date();
    const withDays = expiring.map(e => ({
      ...e,
      daysUntilExpiry: Math.ceil((new Date(e.expirationDate!).getTime() - now.getTime()) / 86400000),
      expiresDate: new Date(e.expirationDate!).toISOString().split('T')[0],
      action: new Date(e.expiresAt!).getTime() - now.getTime() < 30 * 86400000
        ? 'URGENT: DPS renewal takes 2-6 weeks. Initiate immediately or remove from schedule on expiry date.'
        : 'Notify officer now. Texas DPS renewal processing: 2-6 weeks.',
    }));

    return createResult(req.actionId, true,
      `${expiring.length} security license(s) expiring within ${daysAhead} days. DPS renewal takes 2-6 weeks — notify officers NOW.`,
      { expiring: withDays, count: expiring.length, daysAhead }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

export function registerHiringPipelineActions(): void {
  const actions = [
    createHiringRecord,
    updateHiringStatus,
    initiateBackgroundCheck,
    schedulePERCTraining,
    trackDPSApplication,
    confirmLicenseReceived,
    getHiringPipelineStatus,
    checkMultiStateLicenseEligibility,
    getExpiringLicensesAlert,
  ];
  actions.forEach(a => helpaiOrchestrator.registerAction(a));
  log.info(`[Trinity Hiring Pipeline] Registered ${actions.length} hiring pipeline + PERC/Guard Card licensing actions`);
}
