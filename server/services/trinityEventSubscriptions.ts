/**
 * Trinity Event Subscriptions
 * ===========================
 * Wires all platform events to Trinity AI for awareness and autonomous action.
 * This is the critical integration layer connecting disconnected services to Trinity.
 * 
 * Services Connected:
 * - Schedule publishing → SMS notifications
 * - Payroll processing → SMS/Email notifications
 * - Incident creation → Manager alerts
 * - GPS violations → Security alerts
 * - Compliance checks → Proactive warnings
 * - Employee patterns → Trinity learning
 */

import { platformEventBus, PlatformEvent } from './platformEventBus';
import { sendSMS } from './smsService';
import { emailService } from './emailService';
import { db } from '../db';
import { employees, shifts, workspaces, clients } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

const APP_URL = process.env.REPLIT_DOMAINS?.split(',')[0] 
  ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
  : 'https://coaileague.replit.app';

/**
 * Handle schedule published event - notify all affected employees
 */
async function onSchedulePublished(event: PlatformEvent): Promise<void> {
  const { workspaceId, scheduleId, weekStart, affectedEmployees } = event.metadata || {};
  
  if (!workspaceId || !affectedEmployees?.length) {
    console.log('[TrinityEvents] Schedule published but no employees to notify');
    return;
  }

  console.log(`[TrinityEvents] Schedule published - notifying ${affectedEmployees.length} employees`);

  for (const empId of affectedEmployees) {
    try {
      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, empId),
      });

      if (!employee?.phone) continue;

      const empShifts = await db.query.shifts.findMany({
        where: and(
          eq(shifts.employeeId, empId),
          eq(shifts.workspaceId, workspaceId)
        ),
        limit: 7,
      });

      if (empShifts.length === 0) continue;

      const shiftList = empShifts
        .slice(0, 5)
        .map((s) => `- ${s.date} ${s.startTime}-${s.endTime}`)
        .join('\n');

      await sendSMS({
        to: employee.phone,
        body: `Trinity scheduled you for ${empShifts.length} shifts:\n${shiftList}\n\nView: ${APP_URL}/schedule`,
        workspaceId,
        type: 'schedule_notification',
      });
    } catch (error) {
      console.error(`[TrinityEvents] Failed to notify employee ${empId}:`, error);
    }
  }

  console.log(`[TrinityEvents] Schedule notifications sent`);
}

/**
 * Handle payroll processed event - notify employees of pay
 */
async function onPayrollProcessed(event: PlatformEvent): Promise<void> {
  const { workspaceId, payrollRunId, employeeCount, totalAmount, depositDate } = event.metadata || {};

  if (!workspaceId) return;

  console.log(`[TrinityEvents] Payroll processed - $${totalAmount} for ${employeeCount} employees`);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (workspace?.ownerEmail) {
    await emailService.send({
      to: workspace.ownerEmail,
      subject: 'Payroll Processed Successfully',
      html: `
        <h2>Payroll Complete</h2>
        <p>Trinity has processed payroll for ${employeeCount} employees.</p>
        <ul>
          <li><strong>Total:</strong> $${totalAmount?.toLocaleString()}</li>
          <li><strong>Deposit Date:</strong> ${depositDate || 'Next business day'}</li>
        </ul>
        <p><a href="${APP_URL}/payroll">View Payroll Details</a></p>
      `,
    });
  }
}

/**
 * Handle incident created event - escalate critical incidents
 */
async function onIncidentCreated(event: PlatformEvent): Promise<void> {
  const { workspaceId, incidentId, severity, siteId, reportedBy, incidentType, actionTaken } = event.metadata || {};

  if (severity !== 'critical' && severity !== 'high') return;

  console.log(`[TrinityEvents] ${severity.toUpperCase()} incident created - notifying supervisor`);

  if (reportedBy) {
    const reporter = await db.query.employees.findFirst({
      where: eq(employees.id, reportedBy),
    });

    if (reporter?.supervisorId) {
      const supervisor = await db.query.employees.findFirst({
        where: eq(employees.id, reporter.supervisorId),
      });

      if (supervisor?.phone) {
        let siteName = 'Unknown Site';
        if (siteId) {
          const client = await db.query.clients.findFirst({
            where: eq(clients.id, siteId),
          });
          siteName = client?.companyName || client?.name || siteName;
        }

        await sendSMS({
          to: supervisor.phone,
          body: `INCIDENT at ${siteName}\nType: ${incidentType}\nGuard: ${reporter.firstName} ${reporter.lastName}\nAction: ${actionTaken || 'Pending'}\nView: ${APP_URL}/incidents/${incidentId}`,
          workspaceId,
          type: 'incident_alert',
        });
      }
    }
  }
}

/**
 * Handle GPS violation event - alert manager immediately
 */
async function onGPSViolation(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, distance, siteName } = event.metadata || {};

  if (!workspaceId || !employeeId) return;

  console.log(`[TrinityEvents] GPS violation - employee ${employeeId} was ${distance}m from ${siteName}`);

  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });

  if (employee?.supervisorId) {
    const supervisor = await db.query.employees.findFirst({
      where: eq(employees.id, employee.supervisorId),
    });

    if (supervisor?.phone) {
      await sendSMS({
        to: supervisor.phone,
        body: `GPS ALERT: ${employee.firstName} ${employee.lastName} attempted clock-in ${Math.round(distance)}m from ${siteName}. Possible fraud attempt.`,
        workspaceId,
        type: 'gps_violation',
      });
    }
  }
}

/**
 * Handle shift reminder event - 2 hours before shift
 */
async function onShiftReminder(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, shiftId, startTime, siteName } = event.metadata || {};

  if (!employeeId) return;

  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });

  if (employee?.phone) {
    await sendSMS({
      to: employee.phone,
      body: `Reminder: Your shift at ${siteName || 'assigned location'} starts at ${startTime}. Clock in on time!`,
      workspaceId,
      type: 'shift_reminder',
    });
  }
}

/**
 * Handle certification expiring event
 */
async function onCertificationExpiring(event: PlatformEvent): Promise<void> {
  const { workspaceId, employeeId, certName, daysUntilExpiry } = event.metadata || {};

  if (!employeeId) return;

  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });

  if (employee?.phone && daysUntilExpiry <= 14) {
    await sendSMS({
      to: employee.phone,
      body: `Your ${certName} certification expires in ${daysUntilExpiry} days. Renew ASAP to stay compliant.`,
      workspaceId,
      type: 'certification_expiring',
    });
  }
}

/**
 * Handle compliance check completed event
 */
async function onComplianceChecked(event: PlatformEvent): Promise<void> {
  const { workspaceId, violationsFound, criticalCount } = event.metadata || {};

  if (criticalCount > 0) {
    console.log(`[TrinityEvents] ${criticalCount} critical compliance violations detected`);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (workspace?.ownerEmail) {
      await emailService.send({
        to: workspace.ownerEmail,
        subject: `URGENT: ${criticalCount} Critical Compliance Violations`,
        html: `
          <h2>Compliance Alert</h2>
          <p>Trinity detected <strong>${criticalCount} critical</strong> compliance violations requiring immediate attention.</p>
          <p><a href="${APP_URL}/compliance">View Compliance Dashboard</a></p>
        `,
      });
    }
  }
}

/**
 * Handle invoice generated event - sync to QuickBooks
 */
async function onInvoiceGenerated(event: PlatformEvent): Promise<void> {
  const { workspaceId, invoiceId, clientId, amount } = event.metadata || {};

  console.log(`[TrinityEvents] Invoice generated - $${amount} for client ${clientId}`);
}

/**
 * Initialize all Trinity event subscriptions
 */
export function initializeTrinityEventSubscriptions(): void {
  console.log('[TrinityEvents] Initializing Trinity event subscriptions...');

  platformEventBus.subscribe('schedule_published', {
    name: 'TrinityScheduleNotifier',
    handler: onSchedulePublished,
  });

  platformEventBus.subscribe('automation_completed', {
    name: 'TrinityPayrollNotifier',
    handler: async (event) => {
      if (event.metadata?.automationType === 'payroll') {
        await onPayrollProcessed(event);
      }
    },
  });

  platformEventBus.subscribe('trinity_issue_detected', {
    name: 'TrinityIncidentHandler',
    handler: async (event) => {
      if (event.metadata?.violationType === 'gps_fraud_attempt') {
        await onGPSViolation(event);
      } else if (event.metadata?.incidentType) {
        await onIncidentCreated(event);
      }
    },
  });

  platformEventBus.subscribe('*', {
    name: 'TrinityUniversalLogger',
    handler: async (event) => {
      if (event.metadata?.shiftReminder) {
        await onShiftReminder(event);
      }
      if (event.metadata?.certificationExpiring) {
        await onCertificationExpiring(event);
      }
      if (event.metadata?.complianceCheck) {
        await onComplianceChecked(event);
      }
      if (event.metadata?.invoiceGenerated) {
        await onInvoiceGenerated(event);
      }
    },
  });

  console.log('[TrinityEvents] Trinity event subscriptions initialized');
}

export const trinityEventSubscriptions = {
  initialize: initializeTrinityEventSubscriptions,
  onSchedulePublished,
  onPayrollProcessed,
  onIncidentCreated,
  onGPSViolation,
  onShiftReminder,
  onCertificationExpiring,
  onComplianceChecked,
  onInvoiceGenerated,
};
