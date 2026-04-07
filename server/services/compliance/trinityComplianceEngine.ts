/**
 * Trinity Compliance Intelligence Engine
 * =======================================
 * Core compliance tracking for employee licenses, certifications, and org credentials.
 * Implements the 90/60/30-day multi-tier alert schedule and hard scheduling enforcement.
 *
 * Data source: employee_certifications table (separate from the 14-day onboarding window system)
 *
 * Alert tiers:
 *   90 days: INFO — fire to employee + manager
 *   60 days: WARNING — fire to employee + manager + org_owner + briefing channel
 *   30 days: URGENT — fire to all three channels simultaneously
 *   0 days (expiry): EXPIRED — remove from scheduling eligibility immediately
 *
 * Enforcement:
 *   Expired guard card → block shift assignment (hard)
 *   Required cert missing → block specific post assignment (hard)
 *   Out-of-state license → flag for manager review (soft)
 */

import { db } from '../../db';
import { employeeCertifications, employees, workspaces, workspaceMembers, users } from '@shared/schema';
import { eq, and, lte, gte, or, isNull, lt, inArray } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { briefingChannelService } from '../briefingChannelService';
import { emailService } from '../emailService';
import { NotificationDeliveryService } from '../notificationDeliveryService';

// ── Types ──────────────────────────────────────────────────────────────────

export type LicenseAlertTier = 'compliant' | 'expiring_90' | 'expiring_60' | 'expiring_30' | 'expired' | 'no_expiry_on_file';

export interface GuardLicenseStatus {
  employeeId: string;
  employeeName: string;
  hasGuardLicense: boolean;
  alertTier: LicenseAlertTier;
  daysRemaining: number | null;
  expirationDate: Date | null;
  licenseNumber: string | null;
  issuingAuthority: string | null;
  isSchedulingEligible: boolean;
  blockReason: string | null;
  outOfState: boolean;
  issuingState: string | null;
}

export interface CertificationCheck {
  employeeId: string;
  required: string[];
  present: string[];
  missing: string[];
  eligible: boolean;
  blockReason: string | null;
}

export interface SchedulingEligibilityResult {
  eligible: boolean;
  blockReason: string | null;
  licenseStatus: GuardLicenseStatus | null;
  daysUntilExpiry: number | null;
}

export interface WorkspaceComplianceScan {
  workspaceId: string;
  scannedAt: Date;
  totalOfficers: number;
  compliant: number;
  expiring90: number;
  expiring60: number;
  expiring30: number;
  expired: number;
  schedulingIneligible: number;
  officers: GuardLicenseStatus[];
  outOfStateFlags: Array<{ employeeId: string; name: string; state: string }>;
}

// ── Guard certificate type identifiers ─────────────────────────────────────

const GUARD_CERT_TYPES = ['guard_card', 'guard_license', 'security_license', 'tx_psb', 'security_officer_license'];
const TX_ISSUING_AUTHORITIES = ['texas dps psb', 'texas dps', 'texas department of public safety', 'tx psb', 'tx dps', 'texas department of public safety private security bureau'];

function isGuardCertType(type: string): boolean {
  return GUARD_CERT_TYPES.includes(type.toLowerCase().replace(/[\s-]/g, '_'));
}

function detectIssuingState(authority: string | null): string | null {
  if (!authority) return null;
  const lower = authority.toLowerCase();
  if (lower.includes('texas') || lower.includes('tx ') || lower.includes('tx,') || lower.startsWith('tx')) return 'TX';
  if (lower.includes('louisiana') || lower.includes(' la ') || lower.includes('la dps')) return 'LA';
  if (lower.includes('california') || lower.includes(' ca ') || lower.includes('bsis')) return 'CA';
  if (lower.includes('florida') || lower.includes(' fl ') || lower.includes('fdle')) return 'FL';
  if (lower.includes('new york') || lower.includes(' ny ') || lower.includes('nydos')) return 'NY';
  if (lower.includes('arizona') || lower.includes(' az ') || lower.includes('az dps')) return 'AZ';
  if (lower.includes('georgia') || lower.includes(' ga ') || lower.includes('gpb')) return 'GA';
  return null;
}

function getDaysRemaining(expirationDate: Date): number {
  const now = new Date();
  const diff = expirationDate.getTime() - now.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getAlertTier(daysRemaining: number): LicenseAlertTier {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 30) return 'expiring_30';
  if (daysRemaining <= 60) return 'expiring_60';
  if (daysRemaining <= 90) return 'expiring_90';
  return 'compliant';
}

// ── Core Engine ────────────────────────────────────────────────────────────

/**
 * Get the guard/security officer license status for a specific employee.
 * This is the primary compliance check used for scheduling enforcement.
 */
export async function getGuardLicenseStatus(
  employeeId: string,
  workspaceId: string
): Promise<GuardLicenseStatus> {
  const emp = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
  });

  const name = emp ? `${emp.firstName} ${emp.lastName}` : employeeId;

  const certs = await db
    .select()
    .from(employeeCertifications)
    .where(
      and(
        eq(employeeCertifications.employeeId, employeeId),
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employeeCertifications.status, 'active')
      )
    );

  const guardCert = certs.find(c => isGuardCertType(c.certificationType));

  if (!guardCert) {
    return {
      employeeId,
      employeeName: name,
      hasGuardLicense: false,
      alertTier: 'expired',
      daysRemaining: null,
      expirationDate: null,
      licenseNumber: null,
      issuingAuthority: null,
      isSchedulingEligible: false,
      blockReason: 'No active security officer license on file',
      outOfState: false,
      issuingState: null,
    };
  }

  const expDate = guardCert.expirationDate ? new Date(guardCert.expirationDate) : null;
  const daysRemaining = expDate ? getDaysRemaining(expDate) : null;
  const alertTier: LicenseAlertTier = daysRemaining !== null ? getAlertTier(daysRemaining) : 'no_expiry_on_file';
  const isExpired = alertTier === 'expired' || alertTier === 'no_expiry_on_file';
  const issuingState = detectIssuingState(guardCert.issuingAuthority);
  const outOfState = issuingState !== null && issuingState !== 'TX';

  let blockReason: string | null = null;
  if (alertTier === 'no_expiry_on_file') {
    blockReason = 'Security officer license on file has no expiration date — compliance review required. Officer blocked from scheduling until a compliance officer confirms or enters the expiration date.';
  } else if (alertTier === 'expired') {
    blockReason = `Security officer license expired ${Math.abs(daysRemaining ?? 0)} day(s) ago — officer is not eligible for scheduling until renewal is confirmed`;
  }

  return {
    employeeId,
    employeeName: name,
    hasGuardLicense: true,
    alertTier,
    daysRemaining,
    expirationDate: expDate,
    licenseNumber: guardCert.certificationNumber,
    issuingAuthority: guardCert.issuingAuthority,
    isSchedulingEligible: !isExpired,
    blockReason,
    outOfState,
    issuingState,
  };
}

/**
 * Check if an employee is eligible to be scheduled for any shift.
 * Hard blocks: expired guard card.
 * Returns a simple eligible/reason result for quick gate checks.
 */
export async function checkSchedulingEligibility(
  employeeId: string,
  workspaceId: string
): Promise<SchedulingEligibilityResult> {
  const licenseStatus = await getGuardLicenseStatus(employeeId, workspaceId);

  return {
    eligible: licenseStatus.isSchedulingEligible,
    blockReason: licenseStatus.blockReason,
    licenseStatus,
    daysUntilExpiry: licenseStatus.daysRemaining,
  };
}

/**
 * Check if an employee has all required certifications for a specific post/shift.
 * Required certs are passed as type strings matching certificationType in employee_certifications.
 */
export async function checkRequiredCertifications(
  employeeId: string,
  workspaceId: string,
  requiredCertTypes: string[]
): Promise<CertificationCheck> {
  if (!requiredCertTypes || requiredCertTypes.length === 0) {
    return {
      employeeId,
      required: [],
      present: [],
      missing: [],
      eligible: true,
      blockReason: null,
    };
  }

  const now = new Date();
  const activeCerts = await db
    .select()
    .from(employeeCertifications)
    .where(
      and(
        eq(employeeCertifications.employeeId, employeeId),
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employeeCertifications.status, 'active'),
        or(
          isNull(employeeCertifications.expirationDate),
          gte(employeeCertifications.expirationDate, now)
        )
      )
    );

  const presentTypes = new Set(activeCerts.map(c => c.certificationType.toLowerCase().replace(/[\s-]/g, '_')));

  const normalizedRequired = requiredCertTypes.map(r => r.toLowerCase().replace(/[\s-]/g, '_'));
  const present: string[] = [];
  const missing: string[] = [];

  for (const req of normalizedRequired) {
    const certLabels: Record<string, string[]> = {
      'first_aid': ['first_aid', 'firstaid', 'first_aid_certification', 'first_aid_cpr'],
      'cpr': ['cpr', 'cpr_aed', 'cpr_certification', 'cardiopulmonary_resuscitation'],
      'armed': ['armed', 'armed_guard', 'firearms', 'firearms_qualification', 'tx_level_iii'],
      'taser': ['taser', 'taser_certification', 'conducted_energy_weapon'],
    };

    const aliases = certLabels[req] || [req];
    const hasIt = aliases.some(a => presentTypes.has(a));

    if (hasIt) {
      present.push(req);
    } else {
      missing.push(req);
    }
  }

  const eligible = missing.length === 0;
  let blockReason: string | null = null;
  if (!eligible) {
    const humanReadable = missing.map(m => m.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    blockReason = `Missing required certification(s) for this post: ${humanReadable.join(', ')}. Officer cannot be assigned until these certifications are active.`;
  }

  return {
    employeeId,
    required: normalizedRequired,
    present,
    missing,
    eligible,
    blockReason,
  };
}

/**
 * Detect out-of-state licenses for an employee.
 * Returns the flag + issuing state for manager review UI.
 */
export async function detectOutOfStateLicense(
  employeeId: string,
  workspaceId: string,
  orgState: string = 'TX'
): Promise<{ hasOutOfStateLicense: boolean; issuingState: string | null; licenseNumber: string | null; requiresManagerReview: boolean; note: string | null }> {
  const certs = await db
    .select()
    .from(employeeCertifications)
    .where(
      and(
        eq(employeeCertifications.employeeId, employeeId),
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employeeCertifications.status, 'active')
      )
    );

  const guardCert = certs.find(c => isGuardCertType(c.certificationType));
  if (!guardCert) return { hasOutOfStateLicense: false, issuingState: null, licenseNumber: null, requiresManagerReview: false, note: null };

  const issuingState = detectIssuingState(guardCert.issuingAuthority);
  const outOfState = issuingState !== null && issuingState !== orgState;

  return {
    hasOutOfStateLicense: outOfState,
    issuingState,
    licenseNumber: guardCert.certificationNumber,
    requiresManagerReview: outOfState,
    note: outOfState
      ? `Officer holds a ${issuingState} security license, not ${orgState}. Verify this license is valid for ${orgState} operations per state reciprocity rules before assigning to any post. Manager override required.`
      : null,
  };
}

/**
 * Run a full compliance scan of all employees in a workspace.
 * Returns a breakdown by alert tier for the daily briefing.
 */
export async function runWorkspaceComplianceScan(workspaceId: string): Promise<WorkspaceComplianceScan> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

  const officers: GuardLicenseStatus[] = [];
  const outOfStateFlags: Array<{ employeeId: string; name: string; state: string }> = [];

  for (const emp of allEmployees) {
    const status = await getGuardLicenseStatus(emp.id, workspaceId);
    officers.push(status);

    if (status.outOfState && status.issuingState) {
      outOfStateFlags.push({
        employeeId: emp.id,
        name: status.employeeName,
        state: status.issuingState,
      });
    }
  }

  return {
    workspaceId,
    scannedAt: new Date(),
    totalOfficers: officers.length,
    compliant: officers.filter(o => o.alertTier === 'compliant').length,
    expiring90: officers.filter(o => o.alertTier === 'expiring_90').length,
    expiring60: officers.filter(o => o.alertTier === 'expiring_60').length,
    expiring30: officers.filter(o => o.alertTier === 'expiring_30').length,
    expired: officers.filter(o => o.alertTier === 'expired').length,
    schedulingIneligible: officers.filter(o => !o.isSchedulingEligible).length,
    officers,
    outOfStateFlags,
  };
}

// ── Alert Delivery: 3 channels simultaneously ──────────────────────────────

interface ComplianceAlertDeliveryResult {
  workspaceId: string;
  deliveredAt: Date;
  alertsSent: number;
  officersNotified: string[];
  errors: string[];
}

/**
 * Deliver compliance alerts via all three channels simultaneously:
 *   1. In-platform notification (notification panel)
 *   2. Org Operations Briefing Channel post
 *   3. Resend email to org_owner
 *
 * Called after runWorkspaceComplianceScan() to deliver findings.
 * All three channels fire in parallel via Promise.all — not sequentially.
 */
export async function deliverComplianceAlerts(workspaceId: string): Promise<ComplianceAlertDeliveryResult> {
  const errors: string[] = [];
  const officersNotified: string[] = [];
  let alertsSent = 0;

  const scan = await runWorkspaceComplianceScan(workspaceId);
  const nonCompliantOfficers = scan.officers.filter(o => o.alertTier !== 'compliant');

  if (nonCompliantOfficers.length === 0 && scan.outOfStateFlags.length === 0) {
    return { workspaceId, deliveredAt: new Date(), alertsSent: 0, officersNotified: [], errors: [] };
  }

  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!workspace) return { workspaceId, deliveredAt: new Date(), alertsSent: 0, officersNotified: [], errors: ['Workspace not found'] };

  const ownerRecord = workspace.ownerId
    ? await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, workspace.ownerId)).then(r => r[0])
    : null;

  const managerMembers = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.workspaceRole as any, ['org_owner', 'co_owner', 'manager'])
      )
    );
  const managerUserIds = managerMembers.map(m => m.userId).filter(Boolean);

  for (const officer of nonCompliantOfficers) {
    const tier = officer.alertTier;
    const urgencyLabel = tier === 'expired' ? 'EXPIRED' : tier === 'expiring_30' ? '30-DAY URGENT' : tier === 'expiring_60' ? '60-DAY WARNING' : '90-DAY INFO';
    const dayText = officer.daysRemaining === null ? 'unknown' : officer.daysRemaining < 0 ? `${Math.abs(officer.daysRemaining)} day(s) ago` : `in ${officer.daysRemaining} day(s)`;
    const notificationTitle = tier === 'expired'
      ? `License EXPIRED — ${officer.employeeName}`
      : `License Expiring ${dayText} — ${officer.employeeName}`;
    const notificationMessage = tier === 'expired'
      ? `${officer.employeeName}'s security officer license expired ${dayText}. This officer is blocked from all shift assignments until renewal is confirmed.`
      : `${officer.employeeName}'s security officer license (${officer.licenseNumber ?? 'N/A'}) expires ${dayText}. Action required: coordinate renewal before expiry.`;

    const deliveryTasks: Promise<void>[] = [];

    for (const userId of managerUserIds) {
      if (!userId) continue;
      const shouldNotify =
        tier === 'expired' ||
        tier === 'expiring_30' ||
        (tier === 'expiring_60' && ownerRecord?.id === userId) ||
        (tier === 'expiring_90' && ownerRecord?.id === userId);
      if (!shouldNotify) continue;

      deliveryTasks.push(
        createNotification({
          workspaceId,
          userId,
          type: 'compliance_alert',
          title: notificationTitle,
          message: notificationMessage,
          actionUrl: '/compliance-scenarios',
          relatedEntityType: 'employee',
          relatedEntityId: officer.employeeId,
          createdBy: 'trinity-compliance-engine',
        }).then(() => {}).catch((e: Error) => errors.push(`notif:${userId}: ${e.message}`))
      );
    }

    const briefingPriority = tier === 'expired' ? 'critical' : tier === 'expiring_30' ? 'high' : 'normal';
    const dataPoints = [
      `Officer: ${officer.employeeName}`,
      `License #: ${officer.licenseNumber ?? 'N/A'}`,
      `Issuing Authority: ${officer.issuingAuthority ?? 'Unknown'}`,
      `Status: ${urgencyLabel}`,
      `Days Remaining: ${officer.daysRemaining !== null ? officer.daysRemaining : 'N/A'}`,
      `Scheduling Eligible: ${officer.isSchedulingEligible ? 'Yes' : 'NO — BLOCKED'}`,
    ];

    deliveryTasks.push(
      briefingChannelService.postToBriefingChannel(workspaceId, {
        category: 'COMPLIANCE ALERT',
        title: notificationTitle,
        summary: notificationMessage,
        dataPoints,
        recommendedAction: tier === 'expired'
          ? 'Officer is blocked from scheduling. Upload renewed license and confirm with manager to restore eligibility.'
          : `Coordinate license renewal before expiry. Navigate to /compliance-scenarios for full compliance dashboard.`,
        deepLink: '/compliance-scenarios',
        priority: briefingPriority,
      }).catch((e: Error) => errors.push(`briefing: ${e.message}`))
    );

    if (ownerRecord?.email && (tier === 'expired' || tier === 'expiring_30' || tier === 'expiring_60')) {
      const emailSubject = tier === 'expired'
        ? `URGENT: Security License EXPIRED — ${officer.employeeName}`
        : `${urgencyLabel}: Security License Alert — ${officer.employeeName}`;
      const emailHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:#ffc83c;margin:0;font-size:20px">Trinity Compliance Alert</h1>
            <p style="color:#94a3b8;margin:8px 0 0">${workspace.name ?? 'Your Organization'}</p>
          </div>
          <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0">
            <h2 style="color:#1e293b;margin-top:0">${notificationTitle}</h2>
            <p style="color:#475569">${notificationMessage}</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px">
              ${dataPoints.map(pt => {
                const [k, v] = pt.split(': ');
                return `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;width:40%">${k}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-weight:500">${v ?? ''}</td></tr>`;
              }).join('')}
            </table>
            <div style="margin-top:24px;text-align:center">
              <a href="/compliance-scenarios" style="background:#ffc83c;color:#0f172a;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Compliance Dashboard</a>
            </div>
          </div>
          <div style="background:#e2e8f0;padding:12px 24px;border-radius:0 0 8px 8px;text-align:center">
            <p style="color:#64748b;font-size:12px;margin:0">Trinity Compliance Intelligence &mdash; CoAIleague</p>
          </div>
        </div>`;
      deliveryTasks.push(
        NotificationDeliveryService.send({ type: 'compliance_alert', workspaceId: workspaceId || 'system', recipientUserId: ownerRecord.id, channel: 'email', body: { to: ownerRecord.email, subject: emailSubject, html: emailHtml } })
          .then(() => {}).catch((e: Error) => errors.push(`email: ${e.message}`))
      );
    }

    await Promise.all(deliveryTasks);
    officersNotified.push(officer.employeeName);
    alertsSent++;
  }

  if (scan.outOfStateFlags.length > 0) {
    const oosNames = scan.outOfStateFlags.map(f => `${f.name} (${f.state})`).join(', ');
    const oosTasks: Promise<void>[] = [];

    for (const userId of managerUserIds) {
      if (!userId) continue;
      oosTasks.push(
        createNotification({
          workspaceId,
          userId,
          type: 'compliance_alert',
          title: `Out-of-State License Flag — Manager Review Required`,
          message: `The following officers hold out-of-state security licenses that require manager verification before deployment: ${oosNames}.`,
          actionUrl: '/compliance-scenarios',
          relatedEntityType: 'workspace',
          relatedEntityId: workspaceId,
          createdBy: 'trinity-compliance-engine',
        }).then(() => {}).catch((e: Error) => errors.push(`oos-notif:${userId}: ${e.message}`))
      );
    }

    oosTasks.push(
      briefingChannelService.postToBriefingChannel(workspaceId, {
        category: 'COMPLIANCE ALERT',
        title: 'Out-of-State License Review Required',
        summary: `${scan.outOfStateFlags.length} officer(s) hold out-of-state security licenses. Manager verification required before deployment.`,
        dataPoints: scan.outOfStateFlags.map(f => `${f.name}: ${f.state} license — verify reciprocity for TX operations`),
        recommendedAction: 'Review each officer\'s out-of-state license. Use the override flow at /compliance-scenarios to document approval with reason.',
        deepLink: '/compliance-scenarios',
        priority: 'medium',
      }).catch((e: Error) => errors.push(`oos-briefing: ${e.message}`))
    );

    await Promise.all(oosTasks);
    alertsSent++;
  }

  return { workspaceId, deliveredAt: new Date(), alertsSent, officersNotified, errors };
}

/**
 * Get the compliance alert tier label for display.
 */
export function getAlertTierLabel(tier: LicenseAlertTier): { label: string; severity: 'info' | 'warning' | 'urgent' | 'critical' | 'ok' } {
  switch (tier) {
    case 'compliant': return { label: 'Active', severity: 'ok' };
    case 'expiring_90': return { label: 'Expiring in 90 days (INFO)', severity: 'info' };
    case 'expiring_60': return { label: 'Expiring in 60 days (WARNING)', severity: 'warning' };
    case 'expiring_30': return { label: 'Expiring in 30 days (URGENT)', severity: 'urgent' };
    case 'expired': return { label: 'EXPIRED — Scheduling blocked', severity: 'critical' };
    case 'no_expiry_on_file': return { label: 'No Expiry Date — Compliance Review Required', severity: 'critical' };
  }
}
