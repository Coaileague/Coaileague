/**
 * server/services/shiftEscalationService.ts
 *
 * Trinity 72h / 24h / 4h shift escalation alert scanner.
 *
 * For each active workspace, scans upcoming unassigned shifts and fires
 * time-based escalating notifications:
 *   ≤72h → WARNING  (1× per shift per urgency level, debounced 12h)
 *   ≤24h → URGENT   (notification + email to workspace managers)
 *   ≤4h  → CRITICAL (notification + email + triggers coverage pipeline)
 *
 * Designed to be called from the 30-minute cron in autonomousScheduler.ts.
 */

import { db } from '../db';
import { shifts, workspaces, employees, users, notifications } from '@shared/schema';
import { and, eq, isNull, gte, lte, ne, inArray } from 'drizzle-orm';
import { createNotification } from './notificationService';
import { coveragePipeline } from './automation/coveragePipeline';
import { createLogger } from '../lib/logger';
const log = createLogger('shiftEscalationService');


// ── DB-persisted deduplication: query existing notifications instead of in-memory Map ──
// This survives server restarts unlike the previous Map-based approach.
const DEBOUNCE_MS = 12 * 60 * 60 * 1000; // 12 hours

type UrgencyLevel = 'warning_72h' | 'urgent_24h' | 'critical_4h';

/**
 * Check the notifications table to see if an escalation alert was already sent
 * for this workspace+shift+level within the last DEBOUNCE_MS window.
 * Using the DB as the source of truth prevents duplicate floods on server restart.
 */
async function wasAlertRecentlySent(
  workspaceId: string,
  shiftId: string,
  level: UrgencyLevel,
  userId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEBOUNCE_MS);
  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
        eq(notifications.type, `shift_escalation_${level}` as any),
        eq(notifications.relatedEntityId, shiftId),
        gte(notifications.createdAt, cutoff),
      )
    )
    .limit(1);
  return existing.length > 0;
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface ShiftGap {
  id: string;
  title: string | null;
  startTime: Date | null;
  endTime: Date | null;
  clientId: string | null;
  hoursUntil: number;
}

function classify(hours: number): UrgencyLevel | null {
  if (hours <= 4)  return 'critical_4h';
  if (hours <= 24) return 'urgent_24h';
  if (hours <= 72) return 'warning_72h';
  return null;
}

function levelLabel(level: UrgencyLevel): string {
  switch (level) {
    case 'critical_4h':  return 'CRITICAL';
    case 'urgent_24h':   return 'URGENT';
    case 'warning_72h':  return 'WARNING';
  }
}

function levelIcon(level: UrgencyLevel): string {
  switch (level) {
    case 'critical_4h':  return 'alert-octagon';
    case 'urgent_24h':   return 'alert-triangle';
    case 'warning_72h':  return 'alert-circle';
  }
}

// ── Main exported function ─────────────────────────────────────────────────

export interface ShiftEscalationResult {
  workspacesScanned: number;
  shiftsChecked: number;
  alertsSent: number;
  coveragePipelinesTriggered: number;
}

export async function runShiftEscalationScan(): Promise<ShiftEscalationResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 72 * 3600 * 1000);

  // Get all active workspaces
  const activeWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name, ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.isSuspended, false),
        eq(workspaces.isFrozen, false),
        eq(workspaces.isLocked, false),
        ne(workspaces.subscriptionStatus, 'cancelled'),
        ne(workspaces.subscriptionStatus, 'expired'),
      )
    );

  let shiftsChecked = 0;
  let alertsSent = 0;
  let coveragePipelinesTriggered = 0;

  for (const ws of activeWorkspaces) {
    try {
      // Find all unassigned shifts starting within the 72h window.
      // Exclude cancelled and draft shifts — draft shifts are templates/seeds
      // that haven't been scheduled for real yet, and should not trigger alerts.
      const openShifts = await db
        .select({
          id: shifts.id,
          title: shifts.title,
          startTime: shifts.startTime,
          endTime: shifts.endTime,
          clientId: shifts.clientId,
        })
        .from(shifts)
        .where(
          and(
            eq(shifts.workspaceId, ws.id),
            isNull(shifts.employeeId),
            gte(shifts.startTime, now),
            lte(shifts.startTime, horizon),
            ne(shifts.status, 'cancelled'),
            ne(shifts.status, 'draft'),
          )
        )
        .orderBy(shifts.startTime);

      shiftsChecked += openShifts.length;
      if (openShifts.length === 0) continue;

      // Categorise each shift into a urgency bucket
      const gaps: (ShiftGap & { level: UrgencyLevel })[] = [];
      for (const s of openShifts) {
        if (!s.startTime) continue;
        const hoursUntil = (new Date(s.startTime).getTime() - now.getTime()) / 3600000;
        const level = classify(hoursUntil);
        if (!level) continue;
        gaps.push({ ...s, startTime: new Date(s.startTime), endTime: s.endTime ? new Date(s.endTime) : null, hoursUntil, level });
      }
      if (gaps.length === 0) continue;

      // Get workspace managers/owners to notify
      const managers = await db
        .select({ userId: employees.userId, email: users.email, firstName: users.firstName })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id))
        .where(
          and(
            eq(employees.workspaceId, ws.id),
            inArray(employees.workspaceRole as any, ['org_owner', 'co_owner', 'org_admin', 'manager']),
          )
        );

      const managerUserIds = managers.map(m => m.userId).filter(Boolean) as string[];
      if (managerUserIds.length === 0 && ws.ownerId) {
        managerUserIds.push(ws.ownerId);
      }

      // Send alerts for each gap
      for (const gap of gaps) {
        const label    = levelLabel(gap.level);
        const startStr = gap.startTime!.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const hrs      = gap.hoursUntil.toFixed(0);
        const title    = gap.title || 'Untitled Shift';

        const notifTitle   = `[${label}] Unassigned Shift — ${title}`;
        const notifMessage = `A shift "${title}" starting ${startStr} (in ~${hrs}h) has no assigned officer. Immediate action may be required.`;

        // Notify each manager — skip if a DB record already exists within the debounce window
        // (DB-persisted deduplication survives server restarts, unlike the old in-memory Map)
        for (const uid of managerUserIds) {
          const alreadySent = await wasAlertRecentlySent(ws.id, gap.id, gap.level, uid);
          if (alreadySent) continue;

          await createNotification({
            workspaceId: ws.id,
            userId: uid,
            type: `shift_escalation_${gap.level}`,
            title: notifTitle,
            message: notifMessage,
            actionUrl: `/schedule`,
            relatedEntityType: 'shift',
            relatedEntityId: gap.id,
            metadata: {
              shiftId: gap.id,
              urgencyLevel: gap.level,
              hoursUntilStart: parseFloat(hrs),
              startTime: gap.startTime!.toISOString(),
            },
          });
          alertsSent++;
        }

        // At critical level (≤4h): also trigger the coverage pipeline
        if (gap.level === 'critical_4h') {
          try {
            coveragePipeline.triggerCoverage({
              shiftId: gap.id,
              workspaceId: ws.id,
              reason: 'manual',
              reasonDetails: `Shift escalation scanner: critical gap — shift starts in ${hrs}h`,
            }).catch((e: any) =>
              log.error(`[ShiftEscalation] Coverage pipeline error for shift ${gap.id}:`, e)
            );
            coveragePipelinesTriggered++;
          } catch (e) {
            log.error(`[ShiftEscalation] Could not trigger coverage pipeline for ${gap.id}:`, e);
          }
        }
      }
    } catch (wsErr) {
      log.error(`[ShiftEscalation] Error scanning workspace ${ws.id}:`, wsErr);
    }
  }

  return {
    workspacesScanned: activeWorkspaces.length,
    shiftsChecked,
    alertsSent,
    coveragePipelinesTriggered,
  };
}
