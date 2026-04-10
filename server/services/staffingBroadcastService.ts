/**
 * Staffing Broadcast Service
 *
 * Manages tokenized shift broadcasts for open/call-off replacement positions.
 * Each officer receives a unique one-time-use accept link embedded in their email.
 * First confirmed officer wins; all other tokens are deactivated.
 *
 * Storage: uses existing `broadcasts` + `broadcastRecipients` tables.
 *   - broadcasts.type = 'shift_broadcast'
 *   - broadcastRecipients.responseData = { token, accepted, expiresAt }
 *   - broadcastRecipients.actionTakenAt = timestamp when accepted
 */

import { randomUUID, timingSafeEqual } from 'crypto';
import { db } from '../db';
import {
  broadcasts,
  broadcastRecipients,
  shifts,
  employees,
  users,
  shiftCoverageRequests,
  timeEntries,
} from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { storage } from '../storage';
import {
  sendShiftBroadcastEmail,
  sendCallOffConfirmationEmail,
  sendCallOffManagerAlertEmail,
  sendCallOffReplacementEmail,
} from './emailCore';
import { createLogger } from '../lib/logger';
const log = createLogger('staffingBroadcastService');


/** Constant-time string comparison to prevent timing side-channel attacks on auth tokens */
function safeTokenEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  try {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BroadcastShiftParams {
  workspaceId: string;
  shiftId: string;
  siteName: string;
  shiftDate: string;    // e.g. "Thursday, March 14 2026"
  startTime: string;   // e.g. "08:00 AM"
  endTime: string;     // e.g. "04:00 PM"
  postType: string;    // e.g. "Armed Security Officer"
  payRate?: string;
  officerIds: string[]; // employee IDs to broadcast to
  broadcastedBy: string; // userId of dispatcher
  expiryHours?: number;  // default 24
  orgName: string;
  baseUrl?: string;
}

export interface CallOffParams {
  workspaceId: string;
  shiftId: string;
  officerEmployeeId: string;
  siteName: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  supervisorUserId: string;
  replacementCandidateEmployeeIds?: string[];
  orgName: string;
  baseUrl?: string;
  reason?: string;
}

export interface AcceptTokenResult {
  success: boolean;
  alreadyTaken?: boolean;
  expired?: boolean;
  notFound?: boolean;
  broadcastId?: string;
  shiftId?: string;
  employeeId?: string;
  officerName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

async function getEmployeeUser(employeeId: string): Promise<{
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  userId: string;
} | null> {
  const emp = await db.select({ userId: employees.userId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp.length || !emp[0].userId) return null;

  const user = await db.select({
    id: users.id,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
  })
    .from(users)
    .where(eq(users.id, emp[0].userId))
    .limit(1);

  if (!user.length || !user[0].email) return null;

  const u = user[0];
  return {
    email: u.email,
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    fullName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
    userId: u.id,
  };
}

// ─── Core Service ─────────────────────────────────────────────────────────────

/**
 * Create a shift broadcast for an open/vacant shift.
 * Inserts one broadcast record, one broadcastRecipient per officer (with unique token),
 * then sends each officer a tokenized accept email.
 */
export async function createShiftBroadcast(params: BroadcastShiftParams): Promise<{
  broadcastId: string;
  sent: number;
  failed: string[];
}> {
  const {
    workspaceId, shiftId, siteName, shiftDate, startTime, endTime,
    postType, payRate, officerIds, broadcastedBy, expiryHours = 24,
    orgName, baseUrl = 'https://app.coaileague.com',
  } = params;

  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // 1. Create the broadcast record
  const broadcastId = randomUUID();
  await db.insert(broadcasts).values({
    id: broadcastId,
    workspaceId,
    createdBy: broadcastedBy,
    createdByType: 'manager',
    type: 'shift_broadcast',
    priority: 'high',
    title: `Open Shift — ${siteName} — ${shiftDate}`,
    message: `${postType} needed at ${siteName} on ${shiftDate} from ${startTime} to ${endTime}.`,
    targetType: 'employee_list',
    targetConfig: { employeeIds: officerIds, shiftId },
    actionType: 'token_accept',
    actionConfig: { shiftId, expiryHours },
    expiresAt,
    isActive: true,
    isDraft: false,
  });

  // 2. Create a recipient record with unique token per officer, send email
  const failed: string[] = [];
  let sent = 0;

  await Promise.allSettled(officerIds.map(async (empId) => {
    const token = makeToken();
    const recipientId = randomUUID();
    const acceptUrl = `${baseUrl}/api/staffing/accept/${token}`;

    const user = await getEmployeeUser(empId);
    if (!user) {
      failed.push(empId);
      return;
    }

    await db.insert(broadcastRecipients).values({
      id: recipientId,
      broadcastId,
      employeeId: empId,
      userId: user.userId,
      responseData: {
        token,
        accepted: false,
        expiresAt: expiresAt.toISOString(),
        shiftId,
      },
    });

    await sendShiftBroadcastEmail(user.email, {
      officerName: user.fullName,
      siteName,
      shiftDate,
      startTime,
      endTime,
      postType,
      payRate,
      acceptUrl,
      expiresIn: `${expiryHours} hours`,
      orgName,
    }, workspaceId);

    sent++;
  }));

  return { broadcastId, sent, failed };
}

/**
 * Accept a shift token.
 * - Validates token exists, not expired, broadcast still active.
 * - Marks this recipient as accepted.
 * - Deactivates the broadcast so no other officer can accept.
 * Returns details for the success page / redirect.
 */
export async function acceptShiftToken(token: string): Promise<AcceptTokenResult> {
  // Find the recipient with this token
  const allRecipients = await db.select()
    .from(broadcastRecipients)
    .where(isNull(broadcastRecipients.actionTakenAt));

  const recipient = allRecipients.find(r => {
    const data = r.responseData as any;
    return safeTokenEqual(data?.token, token);
  });

  if (!recipient) {
    return { success: false, notFound: true };
  }

  const data = recipient.responseData as any;

  // Check expiry
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    return { success: false, expired: true };
  }

  // Fetch the broadcast to check if still active
  const broadcast = await db.select()
    .from(broadcasts)
    .where(eq(broadcasts.id, recipient.broadcastId!))
    .limit(1);

  if (!broadcast.length || !broadcast[0].isActive) {
    return { success: false, alreadyTaken: true };
  }

  // Mark this recipient as accepted
  await db.update(broadcastRecipients)
    .set({
      actionTakenAt: new Date(),
      responseData: { ...data, accepted: true },
    })
    .where(eq(broadcastRecipients.id, recipient.id));

  // Deactivate the broadcast so other tokens become invalid
  await db.update(broadcasts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(broadcasts.id, recipient.broadcastId!));

  // Resolve officer name
  let officerName = 'Officer';
  if (recipient.employeeId) {
    const user = await getEmployeeUser(recipient.employeeId);
    if (user) officerName = user.fullName;
  }

  return {
    success: true,
    broadcastId: recipient.broadcastId!,
    shiftId: data.shiftId,
    employeeId: recipient.employeeId ?? undefined,
    officerName,
  };
}

// ─── Call-Off Sequence ────────────────────────────────────────────────────────

/**
 * Fire the 3-email call-off sequence:
 *   Email 1 → officer who called off (confirmation)
 *   Email 2 → manager (alert with replacement candidates)
 *   Email 3 (deferred) → replacement officer once manager selects one
 * Returns broadcastId created for the replacement broadcast.
 */
export async function fireCallOffSequence(params: CallOffParams): Promise<{
  officerEmailSent: boolean;
  managerEmailSent: boolean;
  broadcastId?: string;
  coverageRequestId?: string;
}> {
  const {
    workspaceId, officerEmployeeId, siteName, shiftDate, shiftStart, shiftEnd,
    supervisorUserId, replacementCandidateEmployeeIds = [],
    orgName, baseUrl = 'https://app.coaileague.com', reason,
  } = params;

  // GAP-SCHED-9: Look up the shift record so we have actual timestamps and client
  const [shiftRecord] = await db.select().from(shifts)
    .where(and(eq(shifts.id, params.shiftId), eq(shifts.workspaceId, workspaceId)))
    .limit(1);

  // GAP-SCHED-9: Vacate the shift — null out assignedEmployee and revert to draft
  // so the slot is visibly open and the replacement pipeline can fill it.
  if (shiftRecord) {
    try {
      await db.update(shifts)
        .set({ employeeId: null, status: 'draft' })
        .where(and(eq(shifts.id, params.shiftId), eq(shifts.workspaceId, workspaceId)));
    } catch (vacateErr: any) {
      log.warn('[StaffingBroadcast] Failed to vacate shift (continuing):', vacateErr.message);
    }
  }

  // GAP-SCHED-5: Persist a shift_coverage_requests record so the calloff reason,
  // original officer, and resolution status are queryable from the database.
  let coverageRequestId: string | undefined;
  try {
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 h window
    const normalizedReason = (reason || 'call_off').toLowerCase().replace(/\s+/g, '_');
    const validReasons = ['call_off', 'ncns', 'sick', 'emergency', 'manual'];
    const safeReason = validReasons.includes(normalizedReason) ? normalizedReason : 'call_off';

    const [coverageRecord] = await db.insert(shiftCoverageRequests).values({
      workspaceId,
      originalShiftId: params.shiftId,
      reason: safeReason as 'call_off' | 'ncns' | 'sick' | 'emergency' | 'manual',
      reasonDetails: reason && reason !== safeReason ? reason : null,
      originalEmployeeId: officerEmployeeId,
      shiftDate: shiftRecord?.date || shiftDate,
      shiftStartTime: shiftRecord?.startTime || new Date(),
      shiftEndTime: shiftRecord?.endTime || new Date(),
      clientId: shiftRecord?.clientId || null,
      status: 'open',
      expiresAt,
      candidatesInvited: replacementCandidateEmployeeIds.length,
    }).returning({ id: shiftCoverageRequests.id });

    coverageRequestId = coverageRecord?.id;
  } catch (coverageErr: any) {
    log.warn('[StaffingBroadcast] Failed to create coverage request record:', coverageErr.message);
  }

  // GAP-SCHED-10: Write audit log for the calloff event at the shift level
  try {
    await storage.createAuditLog({
      workspaceId,
      action: 'shift_calloff',
      entityType: 'shift',
      entityId: params.shiftId,
      userId: officerEmployeeId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        originalEmployeeId: officerEmployeeId,
        reason: reason || null,
        coverageRequestId: coverageRequestId || null,
        supervisorUserId,
        replacementCandidatesCount: replacementCandidateEmployeeIds.length,
        shiftDate,
      },
    });
  } catch (auditErr: any) {
    log.warn('[StaffingBroadcast] Calloff audit log failed (non-blocking):', auditErr.message);
  }

  // Fetch officer user data
  const officer = await getEmployeeUser(officerEmployeeId);
  const officerName = officer?.fullName ?? 'Officer';

  // Fetch supervisor user data
  let supervisorName = 'Your Supervisor';
  let supervisorEmail: string | null = null;
  const sup = await db.select({
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
  })
    .from(users)
    .where(eq(users.id, supervisorUserId))
    .limit(1);
  if (sup.length) {
    supervisorName = [sup[0].firstName, sup[0].lastName].filter(Boolean).join(' ') || 'Supervisor';
    supervisorEmail = sup[0].email ?? null;
  }

  const approveUrl = `${baseUrl}/scheduling/call-offs`;

  // GAP-SCHED-6: Tier-sort replacement candidates before broadcasting.
  // Tier 1 (stay-late eligible): officers currently clocked in — can extend shift.
  // Tier 2 (internal qualified pool): regular workspace employees.
  // Tier 3 (platform/contractor pool): external contractors.
  // Within each tier, existing order from caller is preserved.
  let sortedCandidates = [...replacementCandidateEmployeeIds];
  try {
    if (sortedCandidates.length > 1) {
      // Find which candidates have an active clock-in right now (Tier 1)
      const activeClockIns = await db.select({ employeeId: timeEntries.employeeId })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          isNull(timeEntries.clockOut),
        ));
      const activeClockedInIds = new Set(activeClockIns.map(r => r.employeeId));

      sortedCandidates = sortedCandidates.sort((a, b) => {
        const tierA = activeClockedInIds.has(a) ? 1 : 2;
        const tierB = activeClockedInIds.has(b) ? 1 : 2;
        return tierA - tierB;
      });
    }
  } catch (sortErr: any) {
    log.warn('[StaffingBroadcast] Candidate tier-sort failed, using original order:', sortErr.message);
    sortedCandidates = [...replacementCandidateEmployeeIds];
  }

  // Resolve replacement candidates for manager email
  const candidateData: Array<{ name: string; availability: string; phone?: string }> = [];
  await Promise.allSettled(sortedCandidates.slice(0, 5).map(async (empId) => {
    const u = await getEmployeeUser(empId);
    if (u) {
      candidateData.push({
        name: u.fullName,
        availability: 'Available — pending confirmation',
        phone: undefined,
      });
    }
  }));

  let officerEmailSent = false;
  let managerEmailSent = false;

  // Email 1: officer call-off confirmation
  if (officer?.email) {
    try {
      await sendCallOffConfirmationEmail(officer.email, {
        officerName,
        shiftDate,
        siteName,
        supervisorName,
        whatHappensNext: `Your supervisor has been notified and will arrange coverage. You may be contacted for follow-up. Call-offs may impact your attendance record per company policy.`,
        orgName,
      }, workspaceId);
      officerEmailSent = true;
    } catch (err: any) {
      log.warn('[StaffingBroadcast] Officer call-off email failed:', (err instanceof Error ? err.message : String(err)));
    }
  }

  // Email 2: manager alert
  if (supervisorEmail) {
    try {
      await sendCallOffManagerAlertEmail(supervisorEmail, {
        managerName: supervisorName,
        officerName,
        shiftDate,
        siteName,
        shiftStart,
        shiftEnd,
        replacementCandidates: candidateData,
        approveUrl,
        orgName,
        reason,
      }, workspaceId);
      managerEmailSent = true;
    } catch (err: any) {
      log.warn('[StaffingBroadcast] Manager call-off alert email failed:', (err instanceof Error ? err.message : String(err)));
    }
  }

  // Create an open broadcast for replacement (using tier-sorted candidate list)
  let broadcastId: string | undefined;
  if (sortedCandidates.length > 0) {
    try {
      const result = await createShiftBroadcast({
        workspaceId,
        shiftId: params.shiftId,
        siteName,
        shiftDate,
        startTime: shiftStart,
        endTime: shiftEnd,
        postType: 'Security Officer (Call-Off Replacement)',
        officerIds: sortedCandidates,
        broadcastedBy: supervisorUserId,
        expiryHours: 12,
        orgName,
        baseUrl,
      });
      broadcastId = result.broadcastId;
    } catch (err: any) {
      log.warn('[StaffingBroadcast] Replacement broadcast creation failed:', (err instanceof Error ? err.message : String(err)));
    }
  }

  return { officerEmailSent, managerEmailSent, broadcastId, coverageRequestId };
}

/**
 * Send Email 3 — replacement officer assignment.
 * Called by manager when they confirm a replacement officer from the broadcast.
 * Tokens are persisted in broadcastRecipients so confirm/decline routes can validate them.
 */
export async function sendReplacementAssignmentEmail(params: {
  workspaceId: string;
  replacementEmployeeId: string;
  siteName: string;
  siteAddress: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  supervisorName: string;
  supervisorPhone?: string;
  postOrdersSummary?: string;
  responseDeadline: string;
  orgName: string;
  baseUrl?: string;
}): Promise<boolean> {
  const {
    workspaceId, replacementEmployeeId, siteName, siteAddress, shiftDate,
    startTime, endTime, supervisorName, supervisorPhone, postOrdersSummary,
    responseDeadline, orgName,
    baseUrl = 'https://app.coaileague.com',
  } = params;

  const replacement = await getEmployeeUser(replacementEmployeeId);
  if (!replacement?.email) return false;

  const confirmToken = makeToken();
  const declineToken = makeToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour window

  // Persist a broadcast record + recipient record so the confirm/decline routes can validate tokens
  try {
    const broadcastId = randomUUID();
    await db.insert(broadcasts).values({
      id: broadcastId,
      workspaceId,
      createdBy: 'system',
      createdByType: 'system',
      type: 'replacement_assignment',
      priority: 'high',
      title: `Replacement Assignment — ${siteName} — ${shiftDate}`,
      message: `Coverage needed at ${siteName} on ${shiftDate} from ${startTime} to ${endTime}.`,
      targetType: 'employee_list',
      targetConfig: { employeeIds: [replacementEmployeeId] },
      actionType: 'token_accept',
      actionConfig: { confirmToken, declineToken },
      expiresAt,
      isActive: true,
      isDraft: false,
    });

    await db.insert(broadcastRecipients).values({
      id: randomUUID(),
      broadcastId,
      employeeId: replacementEmployeeId,
      userId: replacement.userId,
      responseData: {
        confirmToken,
        declineToken,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        siteName,
        siteAddress,
        shiftDate,
        startTime,
        endTime,
        supervisorName,
        supervisorPhone,
        orgName,
      },
    });
  } catch (storeErr: any) {
    log.warn('[StaffingBroadcast] Failed to persist replacement tokens (email will still send):', storeErr.message);
  }

  try {
    await sendCallOffReplacementEmail(replacement.email, {
      officerName: replacement.fullName,
      shiftDate,
      startTime,
      endTime,
      siteName,
      siteAddress,
      postOrdersSummary,
      confirmUrl: `${baseUrl}/api/staffing/replacement/confirm/${confirmToken}`,
      declineUrl: `${baseUrl}/api/staffing/replacement/decline/${declineToken}`,
      responseDeadline,
      supervisorName,
      supervisorPhone,
      orgName,
    }, workspaceId);
    return true;
  } catch (err: any) {
    log.warn('[StaffingBroadcast] Replacement assignment email failed:', (err instanceof Error ? err.message : String(err)));
    return false;
  }
}

export interface ReplacementTokenResult {
  valid: boolean;
  expired?: boolean;
  alreadyResolved?: boolean;
  action?: 'confirm' | 'decline';
  employeeId?: string;
  siteName?: string;
  shiftDate?: string;
  orgName?: string;
}

/**
 * Resolve a replacement confirm or decline token.
 * Validates the token, marks the recipient record as resolved, and returns context.
 */
export async function resolveReplacementToken(
  token: string,
  action: 'confirm' | 'decline'
): Promise<ReplacementTokenResult> {
  const tokenField = action === 'confirm' ? 'confirmToken' : 'declineToken';

  // Find the recipient record whose responseData contains this token
  const rows = await db
    .select({
      id: broadcastRecipients.id,
      broadcastId: broadcastRecipients.broadcastId,
      employeeId: broadcastRecipients.employeeId,
      responseData: broadcastRecipients.responseData,
      actionTakenAt: broadcastRecipients.actionTakenAt,
    })
    .from(broadcastRecipients)
    .where(
      // JSON path filter: responseData->>'confirmToken' or responseData->>'declineToken'
      // We check both tokens to find the right record, then verify action matches
      and(
        isNull(broadcastRecipients.actionTakenAt)
      )
    )
    .limit(50); // Limit scan for performance; replacement tokens are recent

  // Find the matching record (token must match confirmToken OR declineToken)
  const match = rows.find((r) => {
    const rd = r.responseData as any;
    return safeTokenEqual(rd?.confirmToken, token) || safeTokenEqual(rd?.declineToken, token);
  });

  if (!match) {
    return { valid: false };
  }

  const rd = match.responseData as any;

  // Verify the token belongs to the expected action
  const isConfirmToken = safeTokenEqual(rd?.confirmToken, token);
  const actualAction: 'confirm' | 'decline' = isConfirmToken ? 'confirm' : 'decline';

  // Check expiry
  if (rd?.expiresAt && new Date(rd.expiresAt) < new Date()) {
    return { valid: false, expired: true };
  }

  // Mark as resolved
  try {
    await db
      .update(broadcastRecipients)
      .set({
        actionTakenAt: new Date(),
        responseData: { ...rd, status: actualAction === 'confirm' ? 'confirmed' : 'declined', resolvedAt: new Date().toISOString() },
      })
      .where(eq(broadcastRecipients.id, match.id));
  } catch (updateErr: any) {
    log.warn('[StaffingBroadcast] Failed to mark replacement token resolved:', updateErr.message);
  }

  return {
    valid: true,
    action: actualAction,
    employeeId: match.employeeId || undefined,
    siteName: rd?.siteName,
    shiftDate: rd?.shiftDate,
    orgName: rd?.orgName,
  };
}
