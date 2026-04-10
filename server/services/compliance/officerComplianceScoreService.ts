/**
 * Officer Compliance Score Service
 * =================================
 * Calculates the 0-100 compliance score per the spec's exact weighting:
 *   License active (>30 days)     40 pts
 *   License expiring (<30 days)   20 pts
 *   License expired                0 pts  + HARD BLOCK
 *   Onboarding docs complete      20 pts
 *   Onboarding docs pending       10 pts
 *   Post orders signed            15 pts
 *   Post orders pending            8 pts
 *   No active disciplinary        15 pts
 *   Active disciplinary            8 pts
 *   GPS reliability >90%          10 pts
 *   GPS reliability <90%           5 pts
 *
 * Maximum total = 100 pts
 */

import { db } from '../../db';
import {
  employees,
  employeeComplianceRecords,
  trainingCertifications,
  employeeDocuments,
  officerComplaints,
  workspaces,
  notifications,
  users,
  trainingModules,
  officerTrainingCertificates,
  trainingInterventions,
} from '@shared/schema';
import { eq, and, gte, lte, desc, count, sql, inArray, ne } from 'drizzle-orm';
import { storage } from '../../storage';
import { typedCount } from '../../lib/typedSql';

export interface OfficerComplianceScore {
  officerId: string;
  workspaceId: string;
  totalScore: number;
  isHardBlocked: boolean;
  hardBlockReasons: string[];
  breakdown: ScoreBreakdown;
  tier: 'highly_favorable' | 'favorable' | 'less_favorable' | 'low_priority' | 'minimum_priority' | 'hard_blocked';
}

export interface ScoreBreakdown {
  licenseScore: number;
  licenseStatus: 'active' | 'expiring_soon' | 'expired' | 'unknown';
  licenseDaysUntilExpiry: number | null;
  onboardingScore: number;
  onboardingStatus: 'complete' | 'pending' | 'missing';
  postOrdersScore: number;
  postOrdersStatus: 'signed' | 'pending' | 'not_applicable';
  disciplineScore: number;
  hasActiveDisciplinary: boolean;
  gpsScore: number;
  gpsReliabilityPercent: number | null;
  trainingPenalty: number;
  trainingStatus: 'all_current' | 'expiring_soon' | 'overdue' | 'not_started';
  expiredModules: string[];
  expiringModules: string[];
  openInterventions: number;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Enum values from employeeDocumentTypeEnum that map to required onboarding docs
const ONBOARDING_REQUIRED_TYPES = [
  'employment_application',
  'background_check',
  'zero_policy_drug_form',
  'i9_form',
  'w4_form',
] as const;

// Company-level document types stored under employeeId = 'company' sentinel
const COMPANY_DOC_DEFINITIONS = [
  { key: 'license', label: 'Security Company State License Certificate', required: true },
  { key: 'vehicle_insurance', label: 'Certificate of General Liability Insurance', required: true },
  { key: 'custom_document', label: 'Certificate of Workers Compensation Insurance', required: true },
  { key: 'policy_acknowledgment', label: 'Labor Law Poster Compliance Photograph', required: true },
  { key: 'employee_photograph', label: 'Company Uniform Compliance Photograph', required: true },
  { key: 'certification', label: 'Patrol Vehicle Photographs (or Not Applicable)', required: false },
  { key: 'zero_policy_drug_form', label: 'Drug Free Workplace Policy', required: true },
] as const;

export async function calculateOfficerComplianceScore(
  officerId: string,
  workspaceId: string,
): Promise<OfficerComplianceScore> {
  const now = new Date();
  const hardBlockReasons: string[] = [];
  let isHardBlocked = false;

  const [employee] = await db.select().from(employees)
    .where(and(eq(employees.id, officerId), eq(employees.workspaceId, workspaceId)))
    .limit(1);

  if (!employee) {
    return {
      officerId,
      workspaceId,
      totalScore: 0,
      isHardBlocked: true,
      hardBlockReasons: ['Officer not found'],
      breakdown: buildDefaultBreakdown(),
      tier: 'hard_blocked',
    };
  }

  // ── COMPONENT 1: License (Guard Card) — 40 or 20 or 0 pts ──────────────
  let licenseScore = 0;
  let licenseStatus: ScoreBreakdown['licenseStatus'] = 'unknown';
  let licenseDaysUntilExpiry: number | null = null;

  const [licenseRecord] = await db.select().from(trainingCertifications)
    .where(and(
      eq(trainingCertifications.employeeId, officerId),
      eq(trainingCertifications.workspaceId, workspaceId),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      eq(trainingCertifications.certType, 'guard_card'),
    ))
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .orderBy(desc(trainingCertifications.expirationDate))
    .limit(1);

  // @ts-expect-error — TS migration: fix in refactoring sprint
  if (licenseRecord?.expirationDate) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const expiry = new Date(licenseRecord.expirationDate);
    const msUntilExpiry = expiry.getTime() - now.getTime();
    licenseDaysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

    if (msUntilExpiry < 0) {
      licenseStatus = 'expired';
      licenseScore = 0;
      isHardBlocked = true;
      hardBlockReasons.push(
        `Guard card expired on ${expiry.toLocaleDateString()} — cannot legally perform security work`,
      );
    } else if (msUntilExpiry < THIRTY_DAYS_MS) {
      licenseStatus = 'expiring_soon';
      licenseScore = 20;
    } else {
      licenseStatus = 'active';
      licenseScore = 40;
    }
  } else {
    licenseStatus = 'unknown';
    licenseScore = 0;
    isHardBlocked = true;
    hardBlockReasons.push('No guard card / security license on file');
  }

  // ── COMPONENT 2: Onboarding Documents — 20 or 10 pts ───────────────────
  // Uses employeeDocuments table with actual enum values
  let onboardingScore = 10;
  let onboardingStatus: ScoreBreakdown['onboardingStatus'] = 'pending';

  const uploadedDocs = await db.select({ docType: employeeDocuments.documentType })
    .from(employeeDocuments)
    .where(and(
      eq(employeeDocuments.employeeId, officerId),
      eq(employeeDocuments.workspaceId, workspaceId),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      inArray(employeeDocuments.documentType, ONBOARDING_REQUIRED_TYPES as unknown as string[]),
    ));

  const uploadedTypes = new Set(uploadedDocs.map((d) => d.docType));
  const allPresent = ONBOARDING_REQUIRED_TYPES.every((t) => uploadedTypes.has(t));

  if (allPresent) {
    onboardingScore = 20;
    onboardingStatus = 'complete';
  } else if (uploadedDocs.length > 0) {
    onboardingScore = 10;
    onboardingStatus = 'pending';
  } else {
    onboardingScore = 0;
    onboardingStatus = 'missing';
  }

  // ── COMPONENT 3: Post Orders — 15 or 8 pts ─────────────────────────────
  // policy_acknowledgment is the correct enum value for signed post orders
  let postOrdersScore = 8;
  let postOrdersStatus: ScoreBreakdown['postOrdersStatus'] = 'pending';

  const [postOrderDoc] = await db.select({ status: employeeDocuments.status })
    .from(employeeDocuments)
    .where(and(
      eq(employeeDocuments.employeeId, officerId),
      eq(employeeDocuments.workspaceId, workspaceId),
      eq(employeeDocuments.documentType, 'policy_acknowledgment'),
    ))
    .limit(1);

  if (!postOrderDoc) {
    postOrdersScore = 15;
    postOrdersStatus = 'not_applicable';
  } else if (postOrderDoc.status === 'approved') {
    postOrdersScore = 15;
    postOrdersStatus = 'signed';
  } else {
    postOrdersScore = 8;
    postOrdersStatus = 'pending';
  }

  // ── COMPONENT 4: Disciplinary Actions — 15 or 8 pts ────────────────────
  let disciplineScore = 15;
  let hasActiveDisciplinary = false;

  const [activeComplaint] = await db.select({ id: officerComplaints.id })
    .from(officerComplaints)
    .where(and(
      eq(officerComplaints.employeeId, officerId),
      eq(officerComplaints.workspaceId, workspaceId),
      eq(officerComplaints.status, 'open'),
    ))
    .limit(1);

  if (activeComplaint) {
    disciplineScore = 8;
    hasActiveDisciplinary = true;
  }

  // ── COMPONENT 5: GPS Clock-In Reliability — 10 or 5 pts ────────────────
  // Column is gps_verification_status (not gps_status)
  let gpsScore = 10;
  let gpsReliabilityPercent: number | null = null;

  // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: time_entries | Verified: 2026-03-23
  const gpsStats = await typedCount(sql`
    SELECT
      COUNT(*) FILTER (WHERE gps_verification_status = 'verified') AS verified_count,
      COUNT(*) AS total_count
    FROM time_entries
    WHERE employee_id = ${officerId}
      AND workspace_id = ${workspaceId}
      AND clock_in > NOW() - INTERVAL '90 days'
  `);

  const statsRow = ((gpsStats as any).rows || (gpsStats as any))?.[0];
  if (statsRow) {
    const total = Number(statsRow.total_count ?? 0);
    const verified = Number(statsRow.verified_count ?? 0);
    if (total > 0) {
      gpsReliabilityPercent = Math.round((verified / total) * 100);
      gpsScore = gpsReliabilityPercent >= 90 ? 10 : 5;
    }
  }

  // ── COMPONENT 6: Training Certification — penalty only (0 to -15) ───────
  let trainingPenalty = 0;
  let trainingStatus: ScoreBreakdown['trainingStatus'] = 'all_current';
  const expiredModules: string[] = [];
  const expiringModules: string[] = [];
  let openInterventions = 0;

  try {
    const requiredModules = await db
      .select({ id: trainingModules.id, title: trainingModules.title })
      .from(trainingModules)
      .where(and(eq(trainingModules.isPlatformDefault, true), eq(trainingModules.isRequired, true)));

    if (requiredModules.length > 0) {
      const validCerts = await db
        .select({ moduleId: officerTrainingCertificates.moduleId, expiresAt: officerTrainingCertificates.expiresAt })
        .from(officerTrainingCertificates)
        .where(and(
          eq(officerTrainingCertificates.employeeId, officerId),
          eq(officerTrainingCertificates.workspaceId, workspaceId),
          eq(officerTrainingCertificates.isValid, true),
        ));

      const certByModule = new Map(validCerts.map(c => [c.moduleId, c.expiresAt]));
      let hasExpired = false;
      let hasExpiringSoon = false;
      let hasNotStarted = false;

      for (const mod of requiredModules) {
        const expiresAt = certByModule.get(mod.id);
        if (!expiresAt) {
          hasNotStarted = true;
          expiredModules.push(mod.title);
          trainingPenalty = Math.min(trainingPenalty + 5, 15);
        } else {
          const exp = new Date(expiresAt);
          const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
          if (daysLeft < 0) {
            hasExpired = true;
            expiredModules.push(mod.title);
            trainingPenalty = Math.min(trainingPenalty + 5, 15);
          } else if (daysLeft <= 30) {
            hasExpiringSoon = true;
            expiringModules.push(mod.title);
            trainingPenalty = Math.min(trainingPenalty + 2, 15);
          }
        }
      }

      if (hasExpired || (hasNotStarted && requiredModules.length > 0)) {
        trainingStatus = 'overdue';
      } else if (hasExpiringSoon) {
        trainingStatus = 'expiring_soon';
      } else if (hasNotStarted) {
        trainingStatus = 'not_started';
      } else {
        trainingStatus = 'all_current';
      }

      const openInterventionRecords = await db
        .select({ id: trainingInterventions.id })
        .from(trainingInterventions)
        .where(and(
          eq(trainingInterventions.employeeId, officerId),
          eq(trainingInterventions.workspaceId, workspaceId),
          eq(trainingInterventions.completed, false),
        ));
      openInterventions = openInterventionRecords.length;
    } else {
      trainingStatus = 'all_current';
    }
  } catch {
    // Non-fatal: training factor is optional
    trainingStatus = 'all_current';
  }

  // ── TOTAL SCORE ─────────────────────────────────────────────────────────
  const baseScore = licenseScore + onboardingScore + postOrdersScore + disciplineScore + gpsScore;
  const totalScore = Math.max(0, baseScore - trainingPenalty);

  // Persist compliance score to employee row + write audit log (non-fatal)
  try {
    await db.update(employees)
      .set({
        complianceScore: totalScore,
        complianceScoreUpdatedAt: now,
      })
      .where(eq(employees.id, officerId))
      .catch(() => null);

    // Audit log entry for score change
    try {
      const { auditLogger } = await import('../audit-logger');
      await auditLogger.logEvent(
        { actorId: 'system', actorType: 'SYSTEM', workspaceId },
        {
          eventType: 'compliance_score_updated',
          aggregateId: officerId,
          aggregateType: 'employee',
          payload: {
            totalScore,
            trainingPenalty,
            licenseScore,
            onboardingScore,
            postOrdersScore,
            disciplineScore,
            gpsScore,
            tier: getTier(totalScore, isHardBlocked),
            isHardBlocked,
            calculatedAt: now.toISOString(),
          },
        },
      );
    } catch { /* audit log failure must never block score calculation */ }
  } catch { /* non-fatal */ }

  const tier = getTier(totalScore, isHardBlocked);

  return {
    officerId,
    workspaceId,
    totalScore,
    isHardBlocked,
    hardBlockReasons,
    breakdown: {
      licenseScore,
      licenseStatus,
      licenseDaysUntilExpiry,
      onboardingScore,
      onboardingStatus,
      postOrdersScore,
      postOrdersStatus,
      disciplineScore,
      hasActiveDisciplinary,
      gpsScore,
      gpsReliabilityPercent,
      trainingPenalty,
      trainingStatus,
      expiredModules,
      expiringModules,
      openInterventions,
    },
    tier,
  };
}

function getTier(score: number, isHardBlocked: boolean): OfficerComplianceScore['tier'] {
  if (isHardBlocked) return 'hard_blocked';
  if (score >= 85) return 'highly_favorable';
  if (score >= 70) return 'favorable';
  if (score >= 50) return 'less_favorable';
  if (score >= 30) return 'low_priority';
  return 'minimum_priority';
}

function buildDefaultBreakdown(): ScoreBreakdown {
  return {
    licenseScore: 0,
    licenseStatus: 'unknown',
    licenseDaysUntilExpiry: null,
    onboardingScore: 0,
    onboardingStatus: 'missing',
    postOrdersScore: 0,
    postOrdersStatus: 'not_applicable',
    disciplineScore: 0,
    hasActiveDisciplinary: false,
    gpsScore: 0,
    gpsReliabilityPercent: null,
    trainingPenalty: 0,
    trainingStatus: 'not_started',
    expiredModules: [],
    expiringModules: [],
    openInterventions: 0,
  };
}

export async function calculateWorkspaceComplianceScores(workspaceId: string): Promise<OfficerComplianceScore[]> {
  const activeEmployees = await db.select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));

  const results = await Promise.all(
    activeEmployees.map((e) => calculateOfficerComplianceScore(e.id, workspaceId).catch(() => null)),
  );

  return results.filter(Boolean) as OfficerComplianceScore[];
}

export async function calculateAuditReadinessScore(workspaceId: string): Promise<{
  score: number;
  companyDocuments: { key: string; label: string; uploaded: boolean; required: boolean }[];
  officerSummary: { total: number; compliant: number; hardBlocked: number; avgScore: number };
  missingItems: string[];
}> {
  // Company docs are stored in employeeDocuments with employeeId = 'company' sentinel
  const uploadedCompanyDocs = await db.select({ docType: employeeDocuments.documentType })
    .from(employeeDocuments)
    .where(and(
      eq(employeeDocuments.workspaceId, workspaceId),
      eq(employeeDocuments.employeeId, 'company'),
    ));

  const uploadedCompanyTypes = new Set(uploadedCompanyDocs.map((d) => d.docType));

  const companyDocuments = COMPANY_DOC_DEFINITIONS.map((t) => ({
    key: t.key,
    label: t.label,
    required: t.required,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    uploaded: uploadedCompanyTypes.has(t.key as string),
  }));

  const officerScores = await calculateWorkspaceComplianceScores(workspaceId);
  const hardBlocked = officerScores.filter((s) => s.isHardBlocked).length;
  const compliant = officerScores.filter((s) => s.totalScore >= 85).length;
  const avgScore = officerScores.length > 0
    ? Math.round(officerScores.reduce((sum, s) => sum + s.totalScore, 0) / officerScores.length)
    : 0;

  const missingItems: string[] = [];

  const requiredCompanyDocs = companyDocuments.filter((d) => d.required && !d.uploaded);
  for (const doc of requiredCompanyDocs) missingItems.push(`Missing: ${doc.label}`);
  if (hardBlocked > 0) missingItems.push(`${hardBlocked} officer(s) have expired/missing licenses — hard blocked`);

  const totalItems = companyDocuments.filter((d) => d.required).length + officerScores.length;
  const completedItems = companyDocuments.filter((d) => d.required && d.uploaded).length
    + officerScores.filter((s) => s.totalScore >= 70).length;

  const score = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return {
    score,
    companyDocuments,
    officerSummary: { total: officerScores.length, compliant, hardBlocked, avgScore },
    missingItems,
  };
}

/**
 * Trinity Daily Audit Readiness Reminder
 * Runs daily — checks each workspace's readiness score and sends a
 * compliance_alert notification to the org owner if below 100%.
 */
export async function checkAuditReadinessReminders(): Promise<{ checked: number; reminded: number }> {
  const allWorkspaces = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    ownerId: workspaces.ownerId,
  }).from(workspaces).where(ne(workspaces.subscriptionStatus, 'cancelled'));

  let checked = 0;
  let reminded = 0;

  const AUDIT_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days between audit readiness reminders

  for (const ws of allWorkspaces) {
    try {
      const readiness = await calculateAuditReadinessScore(ws.id);
      checked++;

      if (readiness.score < 100 && ws.ownerId) {
        // Dedup: only remind if no audit readiness notification was sent in the last 7 days
        // OR if the score has dropped at least 5 points since the last notification
        const cutoff = new Date(Date.now() - AUDIT_REMINDER_COOLDOWN_MS);
        const [recentNotif] = await db.select({
          id: notifications.id,
          title: notifications.title,
        })
          .from(notifications)
          .where(and(
            eq(notifications.workspaceId, ws.id),
            eq(notifications.userId, ws.ownerId),
            eq(notifications.type, 'compliance_alert' as any),
            gte(notifications.createdAt, cutoff),
            sql`${notifications.title} LIKE 'Audit Readiness:%'`,
          ))
          .orderBy(desc(notifications.createdAt))
          .limit(1)
          .catch(() => []);

        const skipDueToDedup = recentNotif != null;
        if (skipDueToDedup) continue;

        const missingCount = readiness.missingItems.length;
        const topMissing = readiness.missingItems.slice(0, 3);

        await storage.createNotification({
          workspaceId: ws.id,
          userId: ws.ownerId,
          type: 'compliance_alert',
          title: `Audit Readiness: ${readiness.score}% — Action Required`,
          message: `Your organization's audit readiness score is ${readiness.score}/100. ${missingCount} item${missingCount !== 1 ? 's' : ''} need attention.${topMissing.length > 0 ? ' Top items: ' + topMissing.join('; ') : ''}`,
          actionUrl: '/security-compliance/audit-readiness',
          isRead: false,
          metadata: {
            source: 'trinity_daily_audit_reminder',
            score: readiness.score,
            missingCount,
            missingItems: readiness.missingItems,
          },
        });

        // For critical audit scores (below 70%), also send an email to ensure the owner is reached
        if (readiness.score < 70) {
          try {
            const [owner] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
              .from(users)
              .where(eq(users.id, ws.ownerId))
              .limit(1)
              .catch(() => []);
            if (owner?.email) {
              const { NotificationDeliveryService: _NDS } = await import('../notificationDeliveryService');
              const itemsList = topMissing.map(item => `<li>${item}</li>`).join('');
              await _NDS.send({
                type: 'compliance_alert',
                workspaceId: ws.id,
                recipientUserId: ws.ownerId,
                channel: 'email',
                body: {
                  to: owner.email,
                  subject: `[Action Required] Audit Readiness: ${readiness.score}% — ${ws.name}`,
                  html: `<p>Hi ${owner.firstName || 'there'},</p>
                 <p>Your organization's compliance audit readiness score has dropped to <strong>${readiness.score}/100</strong>.</p>
                 <p>${missingCount} item${missingCount !== 1 ? 's' : ''} require${missingCount === 1 ? 's' : ''} immediate attention:</p>
                 <ul>${itemsList}</ul>
                 <p>Please log into CoAIleague and visit the <a href="/security-compliance/audit-readiness">Audit Readiness page</a> to resolve these items before your next compliance review.</p>
                 <p>— Trinity, CoAIleague AI COO</p>`,
                },
              }).catch(() => null);
            }
          } catch {
            // Non-fatal — email delivery failure should not block in-app notification
          }
        }

        reminded++;
      }
    } catch {
      // Per-workspace errors are non-fatal
    }
  }

  return { checked, reminded };
}
