/**
 * Shift Chatroom Bot Notifier
 * Sends manager/supervisor notifications from ReportBot events in shift chatrooms.
 */

import { db } from '../../db';
import { employees, users } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
const log = createLogger('shiftChatroomBotNotifier');


export async function notifyManagers(
  workspaceId: string,
  reporterName: string,
  eventType: 'incident_filed' | 'dar_generated' | 'dar_approved' | 'legal_hold_set',
  message: string,
  chatroomId: string
): Promise<void> {
  try {
    const managers = await db
      .select({ id: employees.id, userId: employees.userId, firstName: employees.firstName })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          sql`${employees.workspaceRole} IN ('manager', 'co_owner', 'org_owner', 'supervisor')`
        )
      );

    const titles: Record<string, string> = {
      incident_filed: `Incident Filed — ${reporterName}`,
      dar_generated: `DAR Ready for Review — ${reporterName}`,
      dar_approved: `DAR Approved — ${reporterName}`,
      legal_hold_set: `Legal Hold Set — ${reporterName}`,
    };

    const notificationsToCreate = managers
      .filter(mgr => mgr.userId)
      .map(mgr => ({
        workspaceId,
        userId: mgr.userId!,
        type: 'info' as any,
        scope: 'workspace' as any,
        category: 'schedule' as any,
        title: titles[eventType] || `ReportBot Alert — ${reporterName}`,
        message: message.slice(0, 500),
        relatedEntityType: 'shift_chatroom',
        relatedEntityId: chatroomId,
        metadata: { eventType, reporterName, chatroomId },
        createdBy: 'reportbot',
      }));

    if (notificationsToCreate.length > 0) {
      await storage.createBulkNotifications(notificationsToCreate).catch(err => 
        log.warn('[ShiftChatroomBotNotifier] Bulk manager notification failed:', (err instanceof Error ? err.message : String(err)))
      );
    }
  } catch (err: any) {
    log.warn('[ShiftChatroomBotNotifier] Manager notification failed:', (err instanceof Error ? err.message : String(err)));
  }
}
