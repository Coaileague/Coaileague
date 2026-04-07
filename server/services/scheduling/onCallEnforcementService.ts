/**
 * On-Call Enforcement Service — Phase D
 * ========================================
 * Ensures every workspace always has a designated on-call supervisor before
 * any shift window begins. Provides the panic protocol with a verified chain
 * of contact rather than a static list.
 *
 * Enforcement rules:
 *  - At least one PRIMARY (non-backup) supervisor/manager must be on-call at
 *    all times. If none is scheduled, the workspace owner is escalated to.
 *  - Backup supervisors are only contacted if the primary cannot be reached.
 *  - The service is called by the panic trigger and shift-assignment flows.
 */

import { db } from '../../db';
import { onCallSchedule, users } from '@shared/schema';
import { eq, and, lte, gte, isNull } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('onCallEnforcementService');


// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnCallContact {
  userId: string;
  name: string;
  phone: string | null;
  role: string;
  isPrimary: boolean;
  isBackup: boolean;
}

export interface OnCallCoverage {
  hasCoverage: boolean;
  primary: OnCallContact[];
  backup: OnCallContact[];
  fallbackOwner?: OnCallContact;
  coverageValidAt: Date;
  gap?: {
    detected: boolean;
    description: string;
  };
}

// ─── Get On-Call Chain for a Workspace ───────────────────────────────────────

export async function getOnCallChain(
  workspaceId: string,
  asOf: Date = new Date()
): Promise<OnCallCoverage> {
  // Find all active on-call entries covering `asOf`
  const entries = await db.query.onCallSchedule.findMany({
    where: and(
      eq(onCallSchedule.workspaceId, workspaceId),
      eq(onCallSchedule.active, true),
      lte(onCallSchedule.onCallStart, asOf),
      gte(onCallSchedule.onCallEnd, asOf),
    ),
  });

  const contacts: OnCallContact[] = [];

  for (const entry of entries) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, entry.userId),
    });
    if (!user) continue;

    contacts.push({
      userId: entry.userId,
      name: `${user.firstName} ${user.lastName}`.trim() || user.email,
      phone: entry.phoneNumber || user.phone || null,
      role: entry.role,
      isPrimary: !entry.isBackup,
      isBackup: entry.isBackup,
    });
  }

  const primary = contacts.filter(c => c.isPrimary);
  const backup = contacts.filter(c => c.isBackup);

  if (primary.length > 0) {
    return {
      hasCoverage: true,
      primary,
      backup,
      coverageValidAt: asOf,
    };
  }

  // No primary — escalate to workspace owner
  const owner = await db.query.users.findFirst({
    where: and(
      eq(users.workspaceId, workspaceId),
      eq(users.role, 'owner'),
    ),
  });

  const fallbackOwner: OnCallContact | undefined = owner
    ? {
        userId: owner.id,
        name: `${owner.firstName} ${owner.lastName}`.trim() || owner.email,
        phone: owner.phone || null,
        role: 'owner',
        isPrimary: false,
        isBackup: false,
      }
    : undefined;

  return {
    hasCoverage: backup.length > 0 || !!fallbackOwner,
    primary: [],
    backup,
    fallbackOwner,
    coverageValidAt: asOf,
    gap: {
      detected: true,
      description: 'No primary on-call supervisor is scheduled for this time window. ' +
        (backup.length > 0
          ? 'Backup contacts available.'
          : fallbackOwner
          ? 'Escalating to workspace owner.'
          : 'NO COVERAGE DETECTED — owner must designate an on-call supervisor immediately.'),
    },
  };
}

// ─── Validate Coverage for a Time Window ─────────────────────────────────────
// Used by shift-assignment flow before shifts are published.

export async function validateCoverageForWindow(
  workspaceId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<{ covered: boolean; gaps: Array<{ start: Date; end: Date }> }> {
  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // check every 30 minutes
  const gaps: Array<{ start: Date; end: Date }> = [];

  let currentTime = new Date(windowStart);
  let gapStart: Date | null = null;

  while (currentTime <= windowEnd) {
    const coverage = await getOnCallChain(workspaceId, currentTime);

    if (!coverage.hasCoverage) {
      if (!gapStart) gapStart = new Date(currentTime);
    } else {
      if (gapStart) {
        gaps.push({ start: gapStart, end: new Date(currentTime) });
        gapStart = null;
      }
    }

    currentTime = new Date(currentTime.getTime() + CHECK_INTERVAL_MS);
  }

  if (gapStart) {
    gaps.push({ start: gapStart, end: windowEnd });
  }

  return { covered: gaps.length === 0, gaps };
}

// ─── Schedule On-Call Entry ───────────────────────────────────────────────────

export interface OnCallAssignment {
  workspaceId: string;
  userId: string;
  role: 'supervisor' | 'manager' | 'owner';
  phoneNumber?: string;
  shiftType: 'day' | 'swing' | 'graveyard' | 'custom';
  onCallStart: Date;
  onCallEnd: Date;
  daysOfWeek?: number[];
  isBackup?: boolean;
  backupForUserId?: string;
  createdBy: string;
}

export async function scheduleOnCall(params: OnCallAssignment): Promise<string> {
  const [entry] = await db.insert(onCallSchedule).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    role: params.role,
    phoneNumber: params.phoneNumber,
    shiftType: params.shiftType,
    onCallStart: params.onCallStart,
    onCallEnd: params.onCallEnd,
    daysOfWeek: params.daysOfWeek ?? [],
    isBackup: params.isBackup ?? false,
    backupForUserId: params.backupForUserId,
    createdBy: params.createdBy,
    active: true,
  }).returning({ id: onCallSchedule.id });

  log.info(
    `[OnCall] Scheduled ${params.role} ${params.userId} ` +
    `${params.onCallStart.toISOString()} → ${params.onCallEnd.toISOString()}`
  );
  return entry.id;
}

// ─── Deactivate On-Call Entry ─────────────────────────────────────────────────

export async function deactivateOnCall(entryId: string, workspaceId: string): Promise<void> {
  await db.update(onCallSchedule)
    .set({ active: false, updatedAt: new Date() })
    .where(and(
      eq(onCallSchedule.id, entryId),
      eq(onCallSchedule.workspaceId, workspaceId),
    ));
  log.info(`[OnCall] Entry ${entryId} deactivated`);
}

// ─── Get Current On-Call Supervisors for Panic Protocol ──────────────────────
// Convenience wrapper used by panicProtocolService

export async function getEmergencyChain(workspaceId: string): Promise<{
  supervisors: Array<{ id: string; name: string; phone?: string }>;
  managers: Array<{ id: string; name: string; phone?: string }>;
  ownerId: string;
  ownerPhone?: string;
}> {
  const coverage = await getOnCallChain(workspaceId);
  const now = new Date();

  const allOnCall = [...coverage.primary, ...coverage.backup];

  const supervisors = allOnCall
    .filter(c => c.role === 'supervisor')
    .map(c => ({ id: c.userId, name: c.name, phone: c.phone ?? undefined }));

  const managers = allOnCall
    .filter(c => c.role === 'manager')
    .map(c => ({ id: c.userId, name: c.name, phone: c.phone ?? undefined }));

  const ownerEntry = coverage.fallbackOwner ?? allOnCall.find(c => c.role === 'owner');

  // Always fall back to first workspace owner if none in on-call table
  let ownerId = ownerEntry?.userId ?? '';
  let ownerPhone = ownerEntry?.phone ?? undefined;

  if (!ownerId) {
    const owner = await db.query.users.findFirst({
      where: and(eq(users.workspaceId, workspaceId), eq(users.role, 'owner')),
    });
    ownerId = owner?.id ?? '';
    ownerPhone = owner?.phone ?? undefined;
  }

  return { supervisors, managers, ownerId, ownerPhone };
}
