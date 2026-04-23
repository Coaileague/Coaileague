import { db } from '../../db';
import { timeEntries, employees, shifts, clients, sites, notifications } from '@shared/schema';
import { eq, and, isNull, gte, sql, count } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { typedCount } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('gpsInactivityMonitor');


const GPS_STALE_THRESHOLD_MINUTES = 30;
const SUPERVISOR_ALERT_THRESHOLD_MINUTES = 45;

interface InactivityAlert {
  employeeId: string;
  employeeName: string;
  timeEntryId: string;
  shiftId: string | null;
  minutesSinceLastPing: number;
  lastKnownLat: string | null;
  lastKnownLng: string | null;
  clientName: string | null;
  siteName: string | null;
}

// Notification routing policy:
// GPS inactivity alerts go ONLY to managers and supervisors.
// Owners (org_owner, co_owner) receive executive-level notifications only —
// not operational field management alerts. This prevents owner inbox flooding.

class GPSInactivityMonitorService {
  private lastAlertSent: Map<string, number> = new Map();
  private alertCountPerEntry: Map<string, number> = new Map();
  private readonly ALERT_COOLDOWN_MS = 40 * 60 * 1000; // 40 minutes between repeats
  private readonly MAX_ALERTS_PER_ENTRY = 5; // Cap alerts per shift session to prevent flooding

  async checkActiveShiftsForInactivity(): Promise<{
    checked: number;
    alertsSent: number;
    alerts: InactivityAlert[];
  }> {
    let checked = 0;
    let alertsSent = 0;
    const alerts: InactivityAlert[] = [];

    try {
      const activeEntries = await db
        .select({
          timeEntry: timeEntries,
          employee: employees,
        })
        .from(timeEntries)
        .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
        .where(and(
          isNull(timeEntries.clockOut),
          eq(employees.isActive, true),
          gte(timeEntries.clockIn, new Date(Date.now() - 24 * 60 * 60 * 1000))
        ));

      checked = activeEntries.length;

      for (const { timeEntry, employee } of activeEntries) {
        const lastGpsTime = timeEntry.lastGpsPingAt || timeEntry.clockIn;
        if (!lastGpsTime) continue;

        const minutesSinceLastPing = (Date.now() - new Date(lastGpsTime).getTime()) / (1000 * 60);

        if (minutesSinceLastPing < GPS_STALE_THRESHOLD_MINUTES) continue;

        const alertKey = `${timeEntry.id}`;
        const lastAlert = this.lastAlertSent.get(alertKey);
        if (lastAlert && (Date.now() - lastAlert) < this.ALERT_COOLDOWN_MS) continue;

        // DB-backed daily cap: max 3 full alert cycles (guard + supervisors) per time entry per day.
        // This survives server restarts — the in-memory cap above resets on restart but this does not.
        // CATEGORY C — Raw SQL retained: Count( | Tables: notifications | Verified: 2026-03-23
        const recentResult = await typedCount(sql`
          SELECT COUNT(*) as count FROM notifications
          WHERE related_entity_id = ${timeEntry.id}
            AND type = 'issue_detected'
            AND created_at >= NOW() - INTERVAL '24 hours'
        `);
        const recentAlertCount = Number(recentResult || 0);
        if (recentAlertCount >= 9) {
          log.info(`[GPSInactivityMonitor] Daily DB cap reached for entry ${alertKey} (${recentAlertCount} in 24h) — suppressing`);
          continue;
        }

        // In-memory cap (fast path, supplements DB check within a single process run)
        const alertCount = this.alertCountPerEntry.get(alertKey) || 0;
        if (alertCount >= this.MAX_ALERTS_PER_ENTRY) {
          log.info(`[GPSInactivityMonitor] In-process cap reached for entry ${alertKey} (${alertCount} sent) — suppressing`);
          continue;
        }

        let clientName: string | null = null;
        let siteName: string | null = null;
        let shiftId: string | null = null;

        if (timeEntry.shiftId) {
          shiftId = timeEntry.shiftId;
          const [shift] = await db.select().from(shifts)
            .where(eq(shifts.id, timeEntry.shiftId))
            .limit(1);

          if (shift?.clientId) {
            const [client] = await db.select().from(clients)
              .where(eq(clients.id, shift.clientId))
              .limit(1);
            if (client) {
              clientName = client.companyName || `${client.firstName} ${client.lastName}`;
            }
          }

          if (shift?.siteId) {
            const [site] = await db.select().from(sites)
              .where(eq(sites.id, shift.siteId))
              .limit(1);
            if (site) {
              siteName = site.name;
            }
          }
        }

        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const alert: InactivityAlert = {
          employeeId: employee.id,
          employeeName,
          timeEntryId: timeEntry.id,
          shiftId,
          minutesSinceLastPing: Math.round(minutesSinceLastPing),
          lastKnownLat: timeEntry.clockInLatitude,
          lastKnownLng: timeEntry.clockInLongitude,
          clientName,
          siteName,
        };
        alerts.push(alert);

        if (employee.userId) {
          await createNotification({
            workspaceId: timeEntry.workspaceId,
            userId: employee.userId,
            type: 'issue_detected',
            title: 'GPS Activity Check',
            message: `No GPS activity detected for ${Math.round(minutesSinceLastPing)} minutes${siteName ? ` at ${siteName}` : ''}. Please confirm you are on-site and active. Open the app to update your location.`,
            actionUrl: '/time-tracking',
            relatedEntityType: 'time_entry',
            relatedEntityId: timeEntry.id,
            metadata: {
              notificationType: 'gps_inactivity_guard',
              minutesSinceLastPing: Math.round(minutesSinceLastPing),
              siteName,
            },
          });
          alertsSent++;
        }

        if (minutesSinceLastPing >= SUPERVISOR_ALERT_THRESHOLD_MINUTES) {
          // ROUTING POLICY: GPS inactivity → managers and supervisors ONLY.
          // Do NOT include org_owner or co_owner — operational field alerts are
          // a manager/supervisor responsibility. Owners receive executive summaries.
          const managers = await db.query.employees.findMany({
            where: and(
              eq(employees.workspaceId, timeEntry.workspaceId),
              eq(employees.isActive, true),
              sql`${employees.workspaceRole} IN ('manager', 'supervisor', 'department_manager', 'field_supervisor')`
            ),
            columns: { userId: true, id: true },
          });

          for (const mgr of managers) {
            if (!mgr.userId || mgr.id === employee.id) continue;

            await createNotification({
              workspaceId: timeEntry.workspaceId,
              userId: mgr.userId,
              type: 'issue_detected',
              title: 'Guard GPS Inactivity Alert',
              idempotencyKey: `issue_detected-${Date.now()}-${mgr.userId}`,
              message: `${employeeName} has had no GPS activity for ${Math.round(minutesSinceLastPing)} minutes${siteName ? ` at ${siteName}` : ''}${clientName ? ` (${clientName})` : ''}. Immediate attention may be required.`,
              actionUrl: '/time-tracking',
              relatedEntityType: 'time_entry',
              relatedEntityId: timeEntry.id,
              metadata: {
                notificationType: 'gps_inactivity_supervisor',
                employeeId: employee.id,
                employeeName,
                minutesSinceLastPing: Math.round(minutesSinceLastPing),
                siteName,
                clientName,
              },
            });
            alertsSent++;
          }
        }

        this.lastAlertSent.set(alertKey, Date.now());
        this.alertCountPerEntry.set(alertKey, (this.alertCountPerEntry.get(alertKey) || 0) + 1);
      }

      if (alerts.length > 0) {
        log.info(`[GPSInactivityMonitor] Checked ${checked} active entries, sent ${alertsSent} alerts for ${alerts.length} inactive guards`);
      }
    } catch (error) {
      log.error('[GPSInactivityMonitor] Check failed:', error);
    }

    return { checked, alertsSent, alerts };
  }
}

export const gpsInactivityMonitor = new GPSInactivityMonitorService();
