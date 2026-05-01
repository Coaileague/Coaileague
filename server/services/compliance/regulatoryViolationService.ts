/**
 * Regulatory Violation Service
 * =============================
 * Creates WORM-locked violation records when hard blocks are manually overridden.
 * Every record is immutable from the moment of creation.
 * Notifies org_owner immediately via in-platform notification and email.
 */

import { db } from '../../db';
import { sql, eq, desc, and } from 'drizzle-orm';
import { regulatoryViolations, complianceStates, workspaces, users, employees } from '@shared/schema';
import { createNotification } from '../notificationService';
import { emailService } from '../emailService';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('regulatoryViolationService');


export type ViolationType =
  | 'expired_license_override'
  | 'armed_without_qualification'
  | 'wrong_license_class'
  | 'company_license_expired'
  | 'state_specific_hard_block'
  | 'armed_commission_invalid'
  | 'plainclothes_without_ppo'
  | 'psych_eval_pending';

interface CreateViolationParams {
  workspaceId: string;
  officerId: string;
  overrideByUserId: string;
  violationType: ViolationType;
  overrideReason: string;
  shiftId?: string;
  siteId?: string;
  clientId?: string;
  officerLicenseNumber?: string;
  licenseExpirationDate?: string;
  shiftDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  stateCode?: string;
}

const VIOLATION_TYPE_LABELS: Record<ViolationType, string> = {
  expired_license_override: 'Expired Guard Card / Security License Override',
  armed_without_qualification: 'Armed Officer Without Active Firearms Qualification',
  wrong_license_class: 'Assignment Requires License Class Not Held',
  company_license_expired: 'Company Operating Without Valid License',
  state_specific_hard_block: 'State-Specific Regulatory Hard Block Override',
  armed_commission_invalid: 'Armed Assignment Without Valid Commissioned Officer License',
  plainclothes_without_ppo: 'Plainclothes Assignment Without Personal Protection Officer Endorsement',
  psych_eval_pending: 'Armed Status Without Cleared Psychological Evaluation',
};

// Inner Record is Partial so states without an explicit citation fall back to the generic
// hard-block string in getCitation(). New TX-only violation types do not require CA/FL/NY equivalents.
const VIOLATION_CITATIONS: Record<string, Partial<Record<ViolationType, string>>> = {
  TX: {
    expired_license_override: 'Texas Occupations Code Chapter 1702, § 1702.221',
    armed_without_qualification: 'Texas Occupations Code Chapter 1702, § 1702.163',
    wrong_license_class: 'Texas Occupations Code Chapter 1702, § 1702.101',
    company_license_expired: 'Texas Occupations Code Chapter 1702, § 1702.102',
    state_specific_hard_block: 'Texas Occupations Code Chapter 1702',
    armed_commission_invalid: 'Texas Occupations Code Chapter 1702, § 1702.161',
    plainclothes_without_ppo: 'Texas Occupations Code Chapter 1702, § 1702.323',
    psych_eval_pending: 'Texas Occupations Code Chapter 1702, § 1702.163',
  },
  CA: {
    expired_license_override: 'California B&P Code § 7583.3',
    armed_without_qualification: 'California B&P Code § 7583.38',
    wrong_license_class: 'California B&P Code § 7580',
    company_license_expired: 'California B&P Code § 7580.1',
    state_specific_hard_block: 'California B&P Code §§ 7580-7599.8',
  },
  FL: {
    expired_license_override: 'Florida Statutes § 493.6101',
    armed_without_qualification: 'Florida Statutes § 493.6115(2)',
    wrong_license_class: 'Florida Statutes § 493.6101',
    company_license_expired: 'Florida Statutes § 493.6108',
    state_specific_hard_block: 'Florida Statutes Chapter 493',
  },
  NY: {
    expired_license_override: 'New York GBL Article 7-A § 89-f',
    armed_without_qualification: 'New York GBL Article 7-A § 89-k',
    wrong_license_class: 'New York GBL Article 7-A § 89-f',
    company_license_expired: 'New York GBL Article 7-A § 89-g',
    state_specific_hard_block: 'New York GBL Article 7-A §§ 89-f through 89-p',
  },
};

function getCitation(stateCode: string | undefined, type: ViolationType): string {
  if (stateCode && VIOLATION_CITATIONS[stateCode]?.[type]) {
    return VIOLATION_CITATIONS[stateCode][type];
  }
  return `Security Industry Hard Block — ${VIOLATION_TYPE_LABELS[type]}`;
}

async function getStateLicenseAuthority(stateCode?: string): Promise<string | null> {
  if (!stateCode) return null;
  const [state] = await db.select({ regulatoryBody: complianceStates.regulatoryBody })
    .from(complianceStates).where(eq(complianceStates.stateCode, stateCode)).limit(1);
  return state?.regulatoryBody ?? null;
}

async function getWorkspaceOwner(workspaceId: string): Promise<{ id: string; email: string; name: string } | null> {
  // CATEGORY C — Raw SQL retained: LIMIT | Tables: users, workspace_users | Verified: 2026-03-23
  const result = await typedQuery(sql`
    SELECT u.id, u.email, u.first_name || ' ' || u.last_name AS name
    FROM users u
    JOIN workspace_users wu ON wu.user_id = u.id
    WHERE wu.workspace_id = ${workspaceId} AND wu.role = 'org_owner'
    LIMIT 1
  `);
  const row = (result as any[])?.[0];
  return row ? { id: row.id, email: row.email, name: row.name } : null;
}

async function getOfficerName(officerId: string): Promise<string> {
  // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
  const result = await typedQuery(sql`
    SELECT first_name || ' ' || last_name AS name FROM employees WHERE id = ${officerId} LIMIT 1
  `);
  const row = (result as any[])?.[0];
  return row?.name ?? 'Unknown Officer';
}

export async function createRegulatoryViolation(params: CreateViolationParams): Promise<string> {
  const stateCode = params.stateCode;
  const regulatoryReference = getCitation(stateCode, params.violationType);
  const stateLicenseAuthority = await getStateLicenseAuthority(stateCode);

  const [violation] = await db.insert(regulatoryViolations).values({
    workspaceId: params.workspaceId,
    officerId: params.officerId,
    overrideByUserId: params.overrideByUserId,
    violationType: params.violationType,
    overrideReason: params.overrideReason,
    shiftId: params.shiftId,
    siteId: params.siteId,
    clientId: params.clientId,
    officerLicenseNumber: params.officerLicenseNumber,
    licenseExpirationDate: params.licenseExpirationDate,
    shiftDate: params.shiftDate,
    shiftStartTime: params.shiftStartTime,
    shiftEndTime: params.shiftEndTime,
    stateCode,
    stateLicenseAuthority: stateLicenseAuthority ?? undefined,
    regulatoryReference,
    isWormLocked: true,
  }).returning({ id: regulatoryViolations.id });

  const violationId = violation.id;
  const officerName = await getOfficerName(params.officerId);
  const owner = await getWorkspaceOwner(params.workspaceId);
  const label = VIOLATION_TYPE_LABELS[params.violationType];

  const notificationMessage = [
    `REGULATORY VIOLATION RECORDED — ${label}`,
    ``,
    `Officer: ${officerName}`,
    `Override performed by: User ${params.overrideByUserId}`,
    `Regulatory Reference: ${regulatoryReference}`,
    `Override Reason: ${params.overrideReason}`,
    ``,
    `This record is WORM-locked and cannot be altered.`,
    `Violation ID: ${violationId}`,
  ].join('\n');

  if (owner) {
    await createNotification({
      workspaceId: params.workspaceId,
      userId: owner.id,
      type: 'regulatory_violation',
      title: 'Regulatory Violation Recorded',
      message: notificationMessage,
      metadata: { violationId, violationType: params.violationType, officerId: params.officerId },
      idempotencyKey: `regulatory_violation-${Date.now()}-${owner.id}`
    }).catch((err) => log.warn('[regulatoryViolationService] Fire-and-forget failed:', err));

    const _violationHtml = `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:#ffc83c;margin:0;font-size:20px">Regulatory Violation Recorded</h1>
            <p style="color:#94a3b8;margin:8px 0 0">This notification is for your records.</p>
          </div>
          <div style="background:#1e293b;padding:24px;border-radius:0 0 8px 8px;color:#e2e8f0">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#94a3b8;width:40%">Violation Type</td><td style="padding:8px 0;font-weight:600;color:#fbbf24">${label}</td></tr>
              <tr><td style="padding:8px 0;color:#94a3b8">Officer</td><td style="padding:8px 0">${officerName}</td></tr>
              <tr><td style="padding:8px 0;color:#94a3b8">Override By</td><td style="padding:8px 0">User ID: ${params.overrideByUserId}</td></tr>
              <tr><td style="padding:8px 0;color:#94a3b8">Override Reason</td><td style="padding:8px 0">${params.overrideReason}</td></tr>
              <tr><td style="padding:8px 0;color:#94a3b8">Regulatory Reference</td><td style="padding:8px 0">${regulatoryReference}</td></tr>
              ${stateCode ? `<tr><td style="padding:8px 0;color:#94a3b8">State</td><td style="padding:8px 0">${stateCode}</td></tr>` : ''}
              ${params.licenseExpirationDate ? `<tr><td style="padding:8px 0;color:#94a3b8">License Expiration</td><td style="padding:8px 0;color:#ef4444">${params.licenseExpirationDate}</td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#94a3b8">Violation ID</td><td style="padding:8px 0;font-family:monospace;font-size:12px">${violationId}</td></tr>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#64748b">This record is WORM-locked. It cannot be edited, altered, or deleted. It will appear in all regulatory compliance reports.</p>
          </div>
        </div>`;
    const emailResult = await NotificationDeliveryService.send({ type: 'regulatory_notification', workspaceId: params.workspaceId, recipientUserId: owner.id, channel: 'email', body: { to: owner.email, subject: `[REGULATORY VIOLATION] ${label} — ${officerName}`, html: _violationHtml } })
      .catch(() => null);

    if (emailResult) {
      // CATEGORY C — Raw SQL retained: UPDATE with now() | Tables: regulatory_violations | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE regulatory_violations
        SET owner_notified_at = now(), owner_notification_email = ${owner.email}
        WHERE id = ${violationId}
      `).catch((err) => log.warn('[regulatoryViolationService] Fire-and-forget failed:', err));
    }
  }

  return violationId;
}

export async function listRegulatoryViolations(
  workspaceId: string,
  opts?: { officerId?: string; from?: Date; to?: Date },
) {
  const conditions = [eq(regulatoryViolations.workspaceId, workspaceId)];
  if (opts?.officerId) conditions.push(eq(regulatoryViolations.officerId, opts.officerId));

  return db.select().from(regulatoryViolations)
    .where(and(...conditions))
    .orderBy(desc(regulatoryViolations.createdAt));
}
