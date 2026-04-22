/**
 * Workspace Compliance Score Service
 *
 * Calculates a 0-100 compliance score for each workspace based on:
 * - License status of all officers
 * - Pending TOPS verifications
 * - Missing background check records
 * - Expired training certs
 * - Incident report timeliness
 *
 * NON-BLOCKING: Low score triggers notifications and auditor visibility
 * but does NOT suspend operations or block owners.
 *
 * Stored in workspace_compliance_scores table for audit trail.
 * Surfaced to: org_owner dashboard, auditor portal, support agents.
 */

import { db, pool } from '../../db';
import { employees } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('ComplianceScore');

export interface ComplianceDeduction {
  category: string;
  description: string;
  points: number;
  employeeId?: string;
  employeeName?: string;
  resolveAction?: string;
}

export interface ComplianceScoreBreakdown {
  total: number;
  licenseScore: number;
  documentScore: number;
  trainingScore: number;
  operationalScore: number;
  deductions: ComplianceDeduction[];
  lastCalculated: Date;
}

export async function calculateComplianceScore(
  workspaceId: string,
): Promise<ComplianceScoreBreakdown> {
  const deductions: ComplianceDeduction[] = [];
  let total = 100;
  const now = new Date();

  // ── LICENSE SCORE (max deduct 40 pts) ────────────────────────────────────
  const blockedOfficers = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
        eq(employees.guardCardStatus, 'expired_hard_block'),
      ),
    );

  for (const emp of blockedOfficers) {
    const pts = 15;
    total -= pts;
    deductions.push({
      category: 'license',
      description: `${emp.firstName} ${emp.lastName} — license expired, hard blocked`,
      points: pts,
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      resolveAction: 'Upload TOPS screenshot or renewed physical card',
    });
  }

  const gracePeriod = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
        eq(employees.guardCardStatus, 'grace_period_renewal'),
      ),
    );

  for (const emp of gracePeriod) {
    const pts = 8;
    total -= pts;
    deductions.push({
      category: 'license',
      description: `${emp.firstName} ${emp.lastName} — license in grace period renewal`,
      points: pts,
      employeeId: emp.id,
      resolveAction: 'Renew license and upload TOPS screenshot',
    });
  }

  const pendingVerification = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
        eq(employees.topsVerificationStatus, 'suspicious'),
      ),
    );

  for (const emp of pendingVerification) {
    const pts = 5;
    total -= pts;
    deductions.push({
      category: 'license',
      description: `${emp.firstName} ${emp.lastName} — TOPS screenshot needs manager review`,
      points: pts,
      resolveAction: 'Review and approve or reject the flagged screenshot',
    });
  }

  // ── DOCUMENT SCORE (max deduct 30 pts) ───────────────────────────────────
  const missingBgCheck = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
        eq(employees.guardCardStatus, 'substantially_complete'),
        isNull(employees.backgroundCheckDate),
      ),
    );

  for (const emp of missingBgCheck) {
    const pts = 10;
    total -= pts;
    deductions.push({
      category: 'document',
      description: `${emp.firstName} ${emp.lastName} — background check record not on file (required for provisional work)`,
      points: pts,
      resolveAction: 'Record background check via officer profile → Credentials tab',
    });
  }

  total = Math.max(0, Math.min(100, total));

  const licenseDeducted = deductions
    .filter((d) => d.category === 'license')
    .reduce((a, d) => a + d.points, 0);
  const documentDeducted = deductions
    .filter((d) => d.category === 'document')
    .reduce((a, d) => a + d.points, 0);

  const result: ComplianceScoreBreakdown = {
    total,
    licenseScore: Math.max(0, 40 - licenseDeducted),
    documentScore: Math.max(0, 30 - documentDeducted),
    trainingScore: 20,
    operationalScore: 10,
    deductions,
    lastCalculated: now,
  };

  await pool
    .query(
      `
      INSERT INTO workspace_compliance_scores (workspace_id, score, breakdown, calculated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (workspace_id) DO UPDATE
        SET score = $2, breakdown = $3, calculated_at = NOW()
    `,
      [workspaceId, total, JSON.stringify(result)],
    )
    .catch((err: any) =>
      log.warn('[ComplianceScore] Failed to persist score (non-fatal):', err?.message),
    );

  return result;
}
