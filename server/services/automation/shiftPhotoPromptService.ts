/**
 * Shift Photo Prompt Service
 *
 * Every 15 minutes: finds active shift chatrooms where the officer hasn't
 * submitted a GPS photo in the last 60 minutes. Sends a prompt via:
 *   1. System message in the shift chatroom
 *   2. NDS push notification to the officer's device
 *
 * Officers who miss 2+ consecutive hourly prompts trigger a supervisor alert.
 *
 * Per TRINITY.md §B (NDS sole sender) all notifications are awaited and
 * logged. Per TRINITY.md §G (tenant isolation) every query is scoped by
 * workspace_id implicitly through the chatroom row itself.
 */

import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db, pool } from '../../db';
import {
  shiftChatrooms,
  shiftChatroomMessages,
  shifts,
  employees,
  users,
} from '@shared/schema';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { createLogger } from '../../lib/logger';

const log = createLogger('shiftPhotoPromptService');

const PHOTO_OVERDUE_MINUTES = 60;
const PHOTO_CRITICALLY_OVERDUE_MINUTES = 120;

export async function promptOverdueShiftPhotos(): Promise<{
  checked: number;
  prompted: number;
  supervisorAlerts: number;
}> {
  const now = new Date();
  const sixtyMinutesAgo = new Date(now.getTime() - PHOTO_OVERDUE_MINUTES * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - PHOTO_CRITICALLY_OVERDUE_MINUTES * 60 * 1000);

  let checked = 0;
  let prompted = 0;
  let supervisorAlerts = 0;

  const activeRooms = await db
    .select({
      chatroomId: shiftChatrooms.id,
      shiftId: shiftChatrooms.shiftId,
      workspaceId: shiftChatrooms.workspaceId,
    })
    .from(shiftChatrooms)
    .where(eq(shiftChatrooms.status, 'active'));

  for (const room of activeRooms) {
    checked++;

    // Resolve officer's employeeId + userId from the shift itself (no assignedEmployeeId column on chatroom)
    const [shift] = await db
      .select({ employeeId: shifts.employeeId, siteId: shifts.siteId })
      .from(shifts)
      .where(eq(shifts.id, room.shiftId))
      .limit(1);

    if (!shift?.employeeId) continue;

    const [lastPhoto] = await db
      .select({ createdAt: shiftChatroomMessages.createdAt })
      .from(shiftChatroomMessages)
      .where(and(
        eq(shiftChatroomMessages.chatroomId, room.chatroomId),
        eq(shiftChatroomMessages.messageType, 'photo')
      ))
      .orderBy(desc(shiftChatroomMessages.createdAt))
      .limit(1);

    const lastPhotoTime = lastPhoto?.createdAt ?? null;
    const isOverdue = !lastPhotoTime || lastPhotoTime < sixtyMinutesAgo;
    const isCriticallyOverdue = !lastPhotoTime || lastPhotoTime < twoHoursAgo;

    if (!isOverdue) continue;

    const overdueMinutes = lastPhotoTime
      ? Math.floor((now.getTime() - lastPhotoTime.getTime()) / 60000)
      : null;

    // 1. Post system message into the chatroom itself.
    try {
      await db.insert(shiftChatroomMessages).values({
        id: crypto.randomUUID(),
        chatroomId: room.chatroomId,
        workspaceId: room.workspaceId,
        userId: 'system',
        content: isCriticallyOverdue
          ? '⚠️ OVERDUE: No proof-of-service photo received in 2+ hours. Please submit a GPS photo immediately.'
          : '📸 Hourly check-in: Please submit a GPS-tagged photo to confirm your location and status.',
        messageType: 'system',
        isAuditProtected: false,
        metadata: {
          promptType: 'hourly_pos_prompt',
          overdueMinutes,
          criticallyOverdue: isCriticallyOverdue,
        },
      });
      prompted++;
    } catch (err: any) {
      log.warn('[PhotoPrompt] chatroom system message failed (non-fatal):', err?.message);
    }

    // 2. Push notification to the officer's device via NDS.
    try {
      const [emp] = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, shift.employeeId))
        .limit(1);

      if (emp?.userId) {
        await NotificationDeliveryService.send({
          type: 'proof_of_service_prompt',
          workspaceId: room.workspaceId,
          recipientUserId: emp.userId,
          channel: 'push',
          subject: isCriticallyOverdue ? 'Photo overdue' : 'Hourly check-in',
          body: {
            title: isCriticallyOverdue ? '⚠️ Photo overdue' : '📸 Hourly check-in',
            message: isCriticallyOverdue
              ? 'No photo received in 2+ hours. Tap to submit.'
              : 'Time for your hourly proof-of-service photo.',
            url: `/shift-chatroom/${room.chatroomId}`,
            chatroomId: room.chatroomId,
            shiftId: room.shiftId,
            actionButtons: [
              { label: 'Submit Photo', action: 'open_camera', data: { chatroomId: room.chatroomId } },
            ],
          },
        });
      }
    } catch (err: any) {
      log.warn('[PhotoPrompt] NDS push failed (non-fatal):', err?.message);
    }

    // 3. Supervisor escalation when critically overdue.
    if (isCriticallyOverdue) {
      try {
        await notifySupervisorOfMissingPhotos({
          workspaceId: room.workspaceId,
          chatroomId: room.chatroomId,
          shiftId: room.shiftId,
          employeeId: shift.employeeId,
          siteId: shift.siteId,
          overdueMinutes,
        });
        supervisorAlerts++;
      } catch (err: any) {
        log.warn('[PhotoPrompt] supervisor alert failed (non-fatal):', err?.message);
      }
    }
  }

  if (checked > 0) {
    log.info(`[PhotoPrompt] checked=${checked} prompted=${prompted} supervisorAlerts=${supervisorAlerts}`);
  }

  return { checked, prompted, supervisorAlerts };
}

async function notifySupervisorOfMissingPhotos(params: {
  workspaceId: string;
  chatroomId: string;
  shiftId: string;
  employeeId: string;
  siteId: string | null;
  overdueMinutes: number | null;
}): Promise<void> {
  // Look up the officer's name for the alert body.
  const [emp] = await db
    .select({ firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(eq(employees.id, params.employeeId))
    .limit(1);

  const officerName = emp
    ? `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || 'Officer'
    : 'Officer';

  // Find manager/supervisor users in the same workspace.
  const supervisors = await pool.query(
    `SELECT id FROM users
       WHERE workspace_id = $1
         AND workspace_role IN ('manager', 'department_manager', 'supervisor', 'org_owner', 'org_admin', 'org_manager', 'co_owner')
       LIMIT 20`,
    [params.workspaceId]
  );

  for (const row of supervisors.rows) {
    try {
      await NotificationDeliveryService.send({
        type: 'system_alert',
        workspaceId: params.workspaceId,
        recipientUserId: row.id,
        channel: 'in_app',
        subject: 'Officer photo check overdue',
        body: {
          title: `⚠️ ${officerName} missed photo check`,
          message: `No proof-of-service photo received in 2+ hours for shift ${params.shiftId}.`,
          url: `/shift-chatroom/${params.chatroomId}`,
          severity: 'warning',
          shiftId: params.shiftId,
          chatroomId: params.chatroomId,
        },
      });
    } catch (err: any) {
      log.warn('[PhotoPrompt] supervisor alert per-user failed:', err?.message);
    }
  }
}
