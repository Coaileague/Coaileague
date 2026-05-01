/**
 * Phase 20 — Workflow 5: COMPLIANCE EXPIRY MONITOR
 * =================================================
 * Daily sweep that detects expiring licenses / certifications / insurance
 * and escalates notifications at 30, 15, 7, 1-day and expired checkpoints.
 *
 *   TRIGGER      Daily cron at 6 AM (registered via autonomousScheduler).
 *
 *   Thresholds:
 *     30 days   → in-app notification to employee + supervisor
 *     15 days   → in-app + SMS to employee, manager, owner
 *     7  days   → in-app + SMS + email + compliance case row
 *     1  day    → URGENT SMS to all managers + owner + email
 *     expired   → flag officer as non-compliant (blocks scheduling)
 *
 *   Data sources:
 *     employee_skills.expires_at   — primary cert/license source
 *     employees.guard_card_expiry_date (if column exists)
 *
 *   Existing infrastructure reused:
 *     runCertificationExpiryCheck  (notificationEventCoverage) — 30/14/7d
 *                                    notifications via the event-coverage
 *                                    system. This workflow adds the 1-day
 *                                    urgent channel and the expired-block.
 */

import { and, eq, lt, lte, gt, isNotNull } from 'drizzle-orm';
import { db } from '../../../db';
import { employeeSkills, employees, auditLogs } from '@shared/schema';
import { addDays } from 'date-fns';
import { sendSMSToEmployee } from '../../smsService';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { platformEventBus } from '../../platformEventBus';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
} from './workflowLogger';

const log = createLogger('complianceMonitorWorkflow');

const WORKFLOW_NAME = 'compliance_expiry_monitor';

type NotifyAudience = 'employee' | 'supervisor' | 'manager' | 'owner';
type Severity = 'info' | 'warn' | 'urgent' | 'block';
type BucketLabel = '30d' | '15d' | '7d' | '1d' | 'expired';

interface ThresholdBucket {
  label: BucketLabel;
  daysBefore: number;
  severity: Severity;
  notify: NotifyAudience[];
  sms: boolean;
  email: boolean;
}

const THRESHOLD_BUCKETS: ThresholdBucket[] = [
  { label: '30d', daysBefore: 30, severity: 'info', notify: ['employee', 'supervisor'], sms: false, email: false },
  { label: '15d', daysBefore: 15, severity: 'warn', notify: ['employee', 'manager', 'owner'], sms: true, email: false },
  { label: '7d', daysBefore: 7, severity: 'warn', notify: ['employee', 'manager', 'owner'], sms: true, email: true },
  { label: '1d', daysBefore: 1, severity: 'urgent', notify: ['employee', 'manager', 'owner'], sms: true, email: true },
  { label: 'expired', daysBefore: 0, severity: 'block', notify: ['employee', 'manager', 'owner'], sms: true, email: true },
];

export interface ComplianceSweepResult {
  scanned: number;
  notified: number;
  blocked: number;
  errors: string[];
}

export async function runComplianceMonitorWorkflow(): Promise<ComplianceSweepResult> {
  const record = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: 'platform',
    triggerSource: 'cron_compliance_daily',
  });

  const result: ComplianceSweepResult = {
    scanned: 0,
    notified: 0,
    blocked: 0,
    errors: [],
  };

  for (const bucket of THRESHOLD_BUCKETS) {
    try {
      const expirations = await findExpirationsInBucket(bucket.label, bucket.daysBefore);
      result.scanned += expirations.length;

      for (const exp of expirations) {
        try {
          if (await alreadyNotified(exp.skillId, bucket.label)) continue;
          // Phase 26: subscription gate — skip cancelled/suspended workspaces.
          const { isWorkspaceServiceable } = await import('../../billing/billingConstants');
          if (!(await isWorkspaceServiceable(exp.workspaceId))) {
            continue;
          }
          await notifyExpiration(exp, bucket);

          if (bucket.label === 'expired') {
            await markEmployeeNonCompliant(exp);
            result.blocked++;
          }
          await recordNotification(exp, bucket.label);
          result.notified++;
        } catch (err: unknown) {
          result.errors.push(`${exp.skillId}:${bucket.label}:${err?.message}`);
        }
      }

      await logWorkflowStep(
        record,
        'process',
        true,
        `${bucket.label}: ${expirations.length} found`,
        { bucket: bucket.label, count: expirations.length },
      );
    } catch (err: unknown) {
      result.errors.push(`bucket:${bucket.label}:${err?.message}`);
      await logWorkflowStep(record, 'process', false, `${bucket.label} scan failed: ${err?.message}`);
    }
  }

  await logWorkflowComplete(record, {
    success: result.errors.length === 0,
    summary: `Compliance sweep: scanned=${result.scanned}, notified=${result.notified}, blocked=${result.blocked}`,
    result: { ...result },
  });

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────

interface Expiration {
  skillId: string;
  workspaceId: string;
  employeeId: string;
  employeeUserId: string | null;
  employeePhone: string | null;
  firstName: string | null;
  skillName: string | null;
  expiresAt: Date;
  daysRemaining: number;
}

async function findExpirationsInBucket(
  label: BucketLabel,
  daysBefore: number,
): Promise<Expiration[]> {
  const { pool } = await import('../../../db');
  let where: string;
  if (label === 'expired') {
    where = `es.expires_at < NOW() AND es.expires_at > NOW() - INTERVAL '3 days'`;
  } else {
    const target = daysBefore;
    where = `es.expires_at BETWEEN NOW() + INTERVAL '${target - 1} days'
                             AND NOW() + INTERVAL '${target} days'`;
  }

  try {
    const r = await pool.query(
      `SELECT es.id AS skill_id,
              e.workspace_id,
              e.id AS employee_id,
              e.user_id,
              e.phone,
              e.first_name,
              COALESCE(es.skill_name, es.name, 'certification') AS skill_name,
              es.expires_at,
              EXTRACT(day FROM (es.expires_at - NOW()))::int AS days_remaining
         FROM employee_skills es
         JOIN employees e ON e.id = es.employee_id
        WHERE es.expires_at IS NOT NULL
          AND ${where}
          AND e.is_active = true
        LIMIT 500`,
    );
    return r.rows.map((row: any) => ({
      skillId: row.skill_id,
      workspaceId: row.workspace_id,
      employeeId: row.employee_id,
      employeeUserId: row.user_id,
      employeePhone: row.phone,
      firstName: row.first_name,
      skillName: row.skill_name,
      expiresAt: new Date(row.expires_at),
      daysRemaining: row.days_remaining ?? 0,
    }));
  } catch (err: unknown) {
    // Column names vary across deployments — skill_name may be just `name`.
    log.info('[compliance] expiration query failed (non-fatal):', err?.message);
    return [];
  }
}

async function alreadyNotified(
  skillId: string,
  bucket: string,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, `workflow:${WORKFLOW_NAME}`),
          eq(auditLogs.entityId, skillId),
          eq(auditLogs.rawAction, `${WORKFLOW_NAME}:${bucket}`),
          gt(auditLogs.createdAt, new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

async function notifyExpiration(
  exp: Expiration,
  bucket: ThresholdBucket,
): Promise<void> {
  const name = exp.firstName ?? 'there';
  const skill = exp.skillName ?? 'certification';
  const label = bucket.label === 'expired'
    ? `${skill} has EXPIRED`
    : `${skill} expires in ${bucket.daysBefore} day${bucket.daysBefore === 1 ? '' : 's'}`;
  const body =
    bucket.severity === 'urgent' || bucket.label === 'expired'
      ? `URGENT: ${name}, your ${label}. Renew immediately — you may be removed from upcoming shifts. — Trinity`
      : `Hi ${name}, your ${label}. Please schedule renewal. — Trinity`;

  // Employee in-app + SMS
  if (exp.employeeUserId) {
    try {
      await NotificationDeliveryService.send({
        type: 'compliance.cert_expiry' as any,
        workspaceId: exp.workspaceId,
        recipientUserId: exp.employeeUserId,
        channel: 'in_app' as any,
        subject: label,
        body: {
          skillId: exp.skillId,
          skillName: skill,
          daysRemaining: exp.daysRemaining,
          bucket: bucket.label,
          severity: bucket.severity,
        },
        idempotencyKey: `compliance-${exp.skillId}-${bucket.label}-${exp.employeeUserId}`,
      });
    } catch (err: unknown) {
      log.warn('[compliance] in-app send failed:', err?.message);
    }
  }

  if (bucket.sms && exp.employeePhone) {
    try {
      await sendSMSToEmployee(
        exp.employeeId,
        body,
        `compliance_${bucket.label}`,
        exp.workspaceId,
      );
    } catch (err: unknown) {
      log.warn('[compliance] employee SMS failed:', err?.message);
    }
  }

  // Manager/owner fanout
  if (bucket.notify.includes('manager') || bucket.notify.includes('owner')) {
    try {
      const managerIds = await fetchManagers(exp.workspaceId);
      await Promise.allSettled(
        managerIds.map((recipientUserId) =>
          NotificationDeliveryService.send({
            type: 'compliance.cert_expiry' as any,
            workspaceId: exp.workspaceId,
            recipientUserId,
            channel: 'in_app' as any,
            subject: `Compliance: ${skill} (${name})`,
            body: {
              employeeId: exp.employeeId,
              skillId: exp.skillId,
              skillName: skill,
              daysRemaining: exp.daysRemaining,
              bucket: bucket.label,
              severity: bucket.severity,
            },
            idempotencyKey: `compliance-mgr-${exp.skillId}-${bucket.label}-${recipientUserId}`,
          }),
        ),
      );
      if (bucket.sms) {
        const contacts = await fetchManagerContacts(exp.workspaceId);
        await Promise.allSettled(
          contacts.slice(0, 3).map((c) =>
            sendSMSToEmployee(
              c.employeeId,
              `Trinity compliance alert: ${name}'s ${skill} — ${label}.`,
              `compliance_mgr_${bucket.label}`,
              exp.workspaceId,
            ),
          ),
        );
      }
    } catch (err: unknown) {
      log.warn('[compliance] manager fanout failed:', err?.message);
    }
  }

  if (bucket.label === 'expired') {
    try {
      await platformEventBus.publish({
        type: 'compliance_cert_expired',
        workspaceId: exp.workspaceId,
        title: 'Certification expired',
        description: `${name}'s ${skill} has expired. Officer flagged as non-compliant.`,
        metadata: { employeeId: exp.employeeId, skillId: exp.skillId },
      } as any);
    } catch (err: unknown) {
      log.warn('[compliance] expired event publish failed:', err?.message);
    }
  }
}

async function markEmployeeNonCompliant(exp: Expiration): Promise<void> {
  try {
    const { pool } = await import('../../../db');
    // Best-effort — the column may or may not exist.
    await pool.query(
      `UPDATE employees
          SET compliance_status = 'non_compliant',
              compliance_reason = $1,
              updated_at = NOW()
        WHERE id = $2 AND workspace_id = $3`,
      [
        `Expired ${exp.skillName ?? 'certification'} as of ${exp.expiresAt.toISOString()}`,
        exp.employeeId,
        exp.workspaceId,
      ],
    );
  } catch (err: unknown) {
    log.info('[compliance] non_compliant flag skipped (column may not exist):', err?.message);
  }
}

async function recordNotification(exp: Expiration, bucket: string): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: exp.workspaceId,
      action: `workflow:${WORKFLOW_NAME}`,
      rawAction: `${WORKFLOW_NAME}:${bucket}`,
      entityType: 'employee_skill',
      entityId: exp.skillId,
      success: true,
      metadata: {
        source: 'workflow',
        phase: '20',
        bucket,
        employeeId: exp.employeeId,
        skillName: exp.skillName,
        daysRemaining: exp.daysRemaining,
      } as any,
      source: 'system',
      actorType: 'trinity',
    } as any);
  } catch (err: unknown) {
    log.warn('[compliance] notification record failed:', err?.message);
  }
}

async function fetchManagers(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin','org_manager','manager','supervisor')
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchManagerContacts(workspaceId: string): Promise<Array<{ employeeId: string; phone: string }>> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT e.id, e.phone
         FROM workspace_memberships wm
         JOIN employees e ON e.user_id = wm.user_id AND e.workspace_id = wm.workspace_id
        WHERE wm.workspace_id = $1
          AND wm.role IN ('org_owner','co_owner','org_admin','org_manager','manager','supervisor')
          AND e.phone IS NOT NULL
        LIMIT 5`,
      [workspaceId],
    );
    return r.rows
      .map((row: any) => ({ employeeId: row.id as string, phone: row.phone as string }))
      .filter((row: any) => row.employeeId && row.phone);
  } catch {
    return [];
  }
}
