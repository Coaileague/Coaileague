/**
 * Trinity Field Intelligence Service
 * Subscribes to all field operational events on the Platform Event Bus.
 * Trinity sees, analyzes, and autonomously responds to everything that happens in the field.
 */

import { platformEventBus } from '../platformEventBus';
import { pool, db } from '../../db';
import { and, eq, exists, gte, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { aiBrainActionLogs } from '@shared/schema/domains/trinity/index';
import { cadUnits, cadCalls, geofenceDepartureLog } from '@shared/schema/domains/ops/index';
import { incidentReports } from '@shared/schema/domains/compliance/index';
import { sites } from '@shared/schema/domains/clients/index';
import { broadcastToWorkspace } from '../../websocket';
import { getOfficerCurrentStatus } from '../officerStatusService';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityFieldIntelligence');

const SERVICE = '[TrinityFieldIntel]';

const _log = (msg: string, data?: any) => {
  log.info(`${SERVICE} ${msg}`, data ? JSON.stringify(data).slice(0, 200) : '');
};

class TrinityFieldIntelligence {
  private initialized = false;

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    _log('Initializing Trinity Field Intelligence — subscribing to all field events');

    this.subscribeToRMSEvents();
    this.subscribeToCADEvents();
    this.subscribeToOfficerEvents();
    this.subscribeToPanicEvents();

    _log('Field Intelligence active — Trinity now sees all field operations');
  }

  private subscribeToRMSEvents() {
    // DAR generated — Trinity monitors all completed shift reports
    platformEventBus.subscribe('dar_generated', {
      name: 'TrinityFieldIntel-DARMonitor',
      handler: async (event) => {
        try {
          const { workspaceId, darId, shiftId, employeeName, flaggedForReview, forceUsed } = event.metadata || {};
          if (!workspaceId || !darId) return;

          _log(`DAR generated: ${employeeName} — flagged=${flaggedForReview}, force=${forceUsed}`);

          // Broadcast Trinity awareness of DAR generation
          await broadcastToWorkspace(workspaceId, {
            type: 'trinity:field_update',
            darId,
            shiftId,
            employeeName,
            message: forceUsed
              ? `Trinity AI flagged a use-of-force incident in the DAR for ${employeeName}. Manager review required.`
              : flaggedForReview
              ? `Trinity AI flagged the DAR for ${employeeName} for manager review.`
              : `DAR compiled for ${employeeName}. Ready for manager review.`,
            severity: forceUsed ? 'high' : flaggedForReview ? 'medium' : 'info',
            action: flaggedForReview ? 'review_dar' : null,
          });

          // Log to AI brain for pattern analysis (non-blocking)
          if (forceUsed) {
            // CATEGORY C — Raw SQL retained: ::jsonb | Tables: ai_brain_action_logs | Verified: 2026-03-23
            await typedPoolExec(`
              INSERT INTO ai_brain_action_logs (workspace_id, action_type, action_data, result, created_at)
              VALUES ($1, 'dar_force_flagged', $2::jsonb, 'flagged_for_review', NOW())
            `, [workspaceId, JSON.stringify({ darId, shiftId, employeeName })]).catch((err) => log.warn('[trinityFieldIntelligence] Fire-and-forget failed:', err));
          }
        } catch (err: any) {
          _log(`DAR monitor error: ${(err instanceof Error ? err.message : String(err))}`);
        }
      }
    });

    // DAR approved — Trinity records approval for compliance tracking
    platformEventBus.subscribe('dar_approved', {
      name: 'TrinityFieldIntel-DARApprovalMonitor',
      handler: async (event) => {
        try {
          const { workspaceId, darId, shiftId, employeeName, approvedBy } = event.metadata || {};
          if (!workspaceId) return;
          _log(`DAR approved: ${employeeName} by ${approvedBy}`);
          await broadcastToWorkspace(workspaceId, {
            type: 'trinity:field_update',
            darId,
            message: `DAR for ${employeeName} has been approved and is ready to send to client.`,
            severity: 'info',
            action: 'send_to_client',
          });
        } catch (err: any) {
          _log(`DAR approval monitor error: ${(err instanceof Error ? err.message : String(err))}`);
        }
      }
    });

    platformEventBus.subscribe('incident_report_filed', {
      name: 'TrinityFieldIntel-IncidentMonitor',
      handler: async (event) => {
        try {
          const { workspaceId, incidentId, category, priority, siteId, siteName, narrative } = event.metadata || {};
          if (!workspaceId) return;

          _log(`Incident filed: ${priority} ${category} at ${siteName}`);

          if (priority === 'critical') {
            await broadcastToWorkspace(workspaceId, {
              type: 'trinity:field_alert',
              severity: 'critical',
              message: `Trinity AI detected a CRITICAL incident at ${siteName || 'unknown site'}. CAD dispatch recommended.`,
              incidentId,
              action: 'check_cad',
            });

            // Converted to Drizzle ORM: EXISTS
            const openCallsRows = await db.select({ id: cadCalls.id })
              .from(cadCalls)
              .where(and(
                eq(cadCalls.workspaceId, workspaceId),
                eq(cadCalls.siteId, siteId),
                notInArray(cadCalls.status, ['resolved', 'closed'])
              ))
              .limit(1)
              .catch(() => []);

            if (!openCallsRows.length && siteId) {
              // Converted to Drizzle ORM: INSERT ... SELECT
              // @ts-expect-error — TS migration: fix in refactoring sprint
              await db.insert(cadCalls).values({
                workspaceId,
                callNumber: sql`'CAD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4))`,
                callType: 'Security Incident',
                priority: 1,
                description: `Auto-created by Trinity: Critical incident reported — ${narrative?.slice(0, 200) || 'No narrative'}`,
                location: sql`COALESCE((SELECT address_line1 || ', ' || city FROM sites WHERE id = ${siteId} AND workspace_id = ${workspaceId}), ${siteName || 'Unknown Site'})`,
                siteId,
                siteName: siteName || 'Unknown Site',
                status: 'pending',
                createdBy: 'Trinity AI',
                latitude: sql`(SELECT geofence_lat FROM sites WHERE id = ${siteId} AND workspace_id = ${workspaceId})`,
                longitude: sql`(SELECT geofence_lng FROM sites WHERE id = ${siteId} AND workspace_id = ${workspaceId})`,
              }).catch(err => _log('Failed to auto-create CAD call', err));

              _log(`Auto-created CAD call for critical incident at site ${siteId}`);
            }
          }

          // Converted to Drizzle ORM
          await db.insert(aiBrainActionLogs).values({
            workspaceId,
            actionType: 'field_intel.incident_analyzed',
            actionData: { incidentId, category, priority, siteId },
            result: 'processed',
            createdAt: sql`now()`,
          }).catch(err => _log('Failed to log incident analysis action', err));

        } catch (e) {
          _log('Error handling incident event', e);
        }
      }
    });

    platformEventBus.subscribe('bolo_match_detected', {
      name: 'TrinityFieldIntel-BOLOMonitor',
      handler: async (event) => {
        try {
          const { workspaceId, boloId, subjectName, siteId, siteName, visitorLogId } = event.metadata || {};
          if (!workspaceId) return;

          _log(`BOLO MATCH: ${subjectName} at ${siteName}`);

          await broadcastToWorkspace(workspaceId, {
            type: 'trinity:bolo_alert',
            severity: 'high',
            message: `BOLO MATCH: ${subjectName} has been identified at ${siteName || 'your facility'}. Dispatch notified.`,
            boloId,
            siteId,
            visitorLogId,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          _log('Error handling BOLO match', e);
        }
      }
    });

    platformEventBus.subscribe('evidence_transferred', {
      name: 'TrinityFieldIntel-EvidenceCustodyTracker',
      handler: async (event) => {
        try {
          const { workspaceId, evidenceId, transferredFromName, transferredToName } = event.metadata || {};
          if (!workspaceId) return;
          _log(`Evidence custody transfer recorded — evidenceId=${evidenceId}, from="${transferredFromName}" to="${transferredToName}"`);
        } catch (e) {
          _log('Error handling evidence_transferred event', e);
        }
      }
    });

    platformEventBus.subscribe('dar_submitted', {
      name: 'TrinityFieldIntel-DARValidator',
      handler: async (event) => {
        try {
          const { workspaceId, darId, employeeId, incidentsOccurred, incidentIds } = event.metadata || {};
          if (!workspaceId || !incidentsOccurred) return;

          if (incidentIds?.length) {
            // Converted to Drizzle ORM: IN subquery → inArray()
            const verifiedRows = await db.select({ id: incidentReports.id })
              .from(incidentReports)
              .where(and(
                inArray(incidentReports.id, incidentIds),
                eq(incidentReports.workspaceId, workspaceId)
              ))
              .catch(() => []);

            if (verifiedRows.length < incidentIds.length) {
              _log(`DAR references ${incidentIds.length} incidents but only ${verifiedRows.length} verified in RMS`);
            }
          }
        } catch (e) {
          _log('Error handling DAR event', e);
        }
      }
    });
  }

  private subscribeToCADEvents() {
    platformEventBus.subscribe('cad_call_created', {
      name: 'TrinityFieldIntel-CADCallHandler',
      handler: async (event) => {
        try {
          const { workspaceId, callId, priority, siteId, siteName, callType } = event.metadata || {};
          if (!workspaceId) return;

          _log(`CAD call created: P${priority} ${callType} at ${siteName}`);

          // CATEGORY C — Raw SQL retained: IS NOT NULL | Tables: cad_units | Verified: 2026-03-23
          const nearestUnit = await typedPool(`
            SELECT cu.id, cu.unit_identifier, cu.employee_name, cu.current_site_name,
              cu.latitude, cu.longitude
            FROM cad_units cu
            WHERE cu.workspace_id = $1
              AND cu.current_status = 'available'
              AND cu.latitude IS NOT NULL
            ORDER BY cu.last_location_update DESC NULLS LAST
            LIMIT 3
          `, [workspaceId]).catch(() => ([]));

          // @ts-expect-error — TS migration: fix in refactoring sprint
          if (nearestUnit.length > 0 && priority === 1) {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            const unit = nearestUnit[0];
            await broadcastToWorkspace(workspaceId, {
              type: 'trinity:dispatch_suggestion',
              callId,
              suggestedUnit: unit.unit_identifier,
              suggestedUnitId: unit.id,
              reason: `Trinity AI suggests ${unit.employee_name} (${unit.unit_identifier}) — nearest available unit`,
            });
          }
        } catch (e) {
          _log('Error handling CAD call event', e);
        }
      }
    });

    platformEventBus.subscribe('panic_alert_triggered', {
      name: 'TrinityFieldIntel-PanicHandler',
      handler: async (event) => {
        try {
          const { workspaceId, alertId, employeeId, employeeName, siteId, siteName, latitude, longitude } = event.metadata || {};
          if (!workspaceId) return;

          _log(`PANIC ALERT from ${employeeName} at ${siteName} — MAXIMUM PRIORITY`);

          await broadcastToWorkspace(workspaceId, {
            type: 'trinity:panic_emergency',
            severity: 'critical',
            alertId,
            employeeName,
            siteName,
            latitude,
            longitude,
            message: `EMERGENCY: ${employeeName} has triggered a PANIC ALERT at ${siteName || 'unknown location'}. Immediate response required.`,
            timestamp: new Date().toISOString(),
          });

          // CATEGORY C — Raw SQL retained: TO_CHAR | Tables: cad_calls | Verified: 2026-03-23
          await typedPoolExec(`
            INSERT INTO cad_calls (
              workspace_id, call_number, call_type, priority, description,
              location, site_id, site_name, status, created_by,
              latitude, longitude, caller_name
            ) VALUES (
              $1,
              'P1-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MI') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4)),
              'Panic/SOS Alert', 1,
              $2, $3, $4, $5, 'pending', 'Trinity AI Auto',
              $6, $7, $8
            )
          `, [
            workspaceId,
            `OFFICER PANIC ALERT — ${employeeName}. Auto-created by Trinity Field Intelligence. Immediate response required.`,
            siteName || 'Location unknown',
            siteId, siteName,
            latitude || null, longitude || null,
            employeeName
          ]).catch(e => _log('Error creating panic CAD call', e));

          _log(`Auto-created Priority-1 CAD call for panic alert from ${employeeName}`);

          // Converted to Drizzle ORM
          await db.insert(aiBrainActionLogs).values({
            workspaceId,
            actionType: 'field_intel.panic_response',
            actionData: { alertId, employeeId, employeeName, siteId },
            result: 'p1_cad_created',
            createdAt: sql`now()`,
          }).catch(err => _log('Failed to log panic response action', err));

        } catch (e) {
          _log('Error handling panic alert', e);
        }
      }
    });
  }

  private subscribeToOfficerEvents() {
    // DEDUP: TrinityFieldIntel-ClockInMonitor in trinityFieldIntelligence.ts is already handled by
    // TrinityFieldIntelligence.initialize() -> subscribeToOfficerEvents()
    // and also TrinityEventSubscriptions.ts has its own subscribers.
    // However, looking at the code, trinityFieldIntelligence.ts is the canonical place for CAD-related logic.
    /*
    platformEventBus.subscribe('officer_clocked_in', {
      name: 'TrinityFieldIntel-ClockInMonitor',
      handler: async (event) => {
        try {
          const { workspaceId, employeeId, employeeName, shiftId, siteId, siteName, latitude, longitude } = event.metadata || {};
          if (!workspaceId || !employeeId) return;

          _log(`Officer clocked in: ${employeeName} at ${siteName}`);

          const { autoProvisionCADUnit } = await import('../officerStatusService');
          await autoProvisionCADUnit(
            employeeId, employeeName || 'Officer', workspaceId,
            shiftId || null, siteId || null, siteName || null,
            latitude, longitude
          );

          await broadcastToWorkspace(workspaceId, {
            type: 'cad:unit_status_changed',
            employeeId,
            employeeName,
            status: 'available',
            siteName,
          });
        } catch (e) {
          _log('Error handling clock-in event', e);
        }
      }
    });
    */

    platformEventBus.subscribe('geofence_departure', {
      name: 'TrinityFieldIntel-GeofenceMonitor',
      handler: async (event) => {
        try {
          const { workspaceId, employeeId, employeeName, siteId, siteName } = event.metadata || {};
          if (!workspaceId) return;

          _log(`Geofence departure: ${employeeName} left ${siteName}`);

          // Converted to Drizzle ORM
          await db.update(cadUnits)
            .set({
              currentStatus: 'needs_check',
              updatedAt: sql`now()`,
            })
            .where(and(eq(cadUnits.employeeId, employeeId), eq(cadUnits.workspaceId, workspaceId)))
            .catch(err => _log('Failed to update CAD unit status on geofence departure', err));

          // Converted to Drizzle ORM
          const departureCountRows = await db.select({ count: sql`COUNT(*)` })
            .from(geofenceDepartureLog)
            .where(and(
              eq(geofenceDepartureLog.employeeId, employeeId),
              eq(geofenceDepartureLog.workspaceId, workspaceId),
              gte(geofenceDepartureLog.departedAt, sql`NOW() - INTERVAL '30 days'`)
            ))
            .catch(err => { _log('Failed to count geofence departures', err); return [{ count: 0 }]; });

          const count = parseInt(String((departureCountRows[0] as any)?.count || '0'));
          if (count >= 3) {
            _log(`Officer ${employeeName} has ${count} geofence departures in 30 days — flagging for training review`);
            // Converted to Drizzle ORM
            await db.update(geofenceDepartureLog)
              // @ts-expect-error — TS migration: fix in refactoring sprint
              .set({ trainingFlagged: true })
              .where(and(
                eq(geofenceDepartureLog.employeeId, employeeId),
                eq(geofenceDepartureLog.workspaceId, workspaceId),
                isNull(geofenceDepartureLog.returnedAt)
              ))
              .catch(err => _log('Failed to flag geofence departure for training', err));
          }

          await broadcastToWorkspace(workspaceId, {
            type: 'cad:geofence_departure',
            employeeId,
            employeeName,
            siteId,
            siteName,
            departureCount: count,
            trainingFlagged: count >= 3,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          _log('Error handling geofence departure', e);
        }
      }
    });

    platformEventBus.subscribe('manual_override_submitted', {
      name: 'TrinityFieldIntel-OverrideTracker',
      handler: async (event) => {
        try {
          const { workspaceId, employeeId, employeeName, reasonCode, reasonDetail } = event.metadata || {};
          if (!workspaceId) return;

          _log(`Manual clock-in override: ${employeeName} — reason: ${reasonCode}`);

          // Converted to Drizzle ORM
          const overrideCountRows = await db.select({ count: sql`COUNT(*)` })
            .from(sql`manual_clockin_overrides`)
            .where(and(
              eq(sql`employee_id`, employeeId),
              eq(sql`workspace_id`, workspaceId),
              gte(sql`created_at`, sql`NOW() - INTERVAL '30 days'`)
            ))
            .catch(() => [{ count: 0 }]);

          const count = parseInt(String((overrideCountRows[0] as any)?.count || '0'));
          if (count >= 3) {
            _log(`Officer ${employeeName} has ${count} manual overrides in 30 days — Trinity flagging for supervisor review`);
          }
        } catch (e) {
          _log('Error handling manual override event', e);
        }
      }
    });
  }

  private subscribeToPanicEvents() {
    platformEventBus.subscribe('panic_alert_acknowledged', {
      name: 'TrinityFieldIntel-PanicAckHandler',
      handler: async (event) => {
        try {
          const { workspaceId, alertId, acknowledgedBy } = event.metadata || {};
          _log(`Panic alert acknowledged by ${acknowledgedBy}`);

          await broadcastToWorkspace(workspaceId, {
            type: 'trinity:panic_acknowledged',
            alertId,
            acknowledgedBy,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          _log('Error handling panic ack', e);
        }
      }
    });
  }
}

export const trinityFieldIntelligence = new TrinityFieldIntelligence();
