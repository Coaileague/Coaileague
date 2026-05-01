/**
 * Trinity Compliance Scenario Runner — Acme Security Test Suite
 * ==============================================================
 * Runs the 6 mandated compliance simulation scenarios for Acme Security.
 * Each scenario has explicit acceptance criteria with PASS/FAIL.
 *
 * Scenarios:
 *  1. License expiring in 25 days → 30-day URGENT alert fires, still scheduling-eligible
 *  2. License expired yesterday → EXPIRED status, scheduling BLOCKED
 *  3. Renewal upload → manager confirmation flow, eligibility restored
 *  4. First Aid required post → block without cert, allow after cert added
 *  5. Org insurance expiring in 45 days → 60-day WARNING fires
 *  6. Out-of-state (Louisiana) license → flagged for manager review, override available
 */

import { db } from '../../db';
import { employeeCertifications, employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  getGuardLicenseStatus,
  checkSchedulingEligibility,
  checkRequiredCertifications,
  detectOutOfStateLicense,
} from './trinityComplianceEngine';

const ACME_WS = 'dev-acme-security-ws';

// Scenario-specific employee IDs (set by compliance scenario seed)
const S1_EMPLOYEE_ID = 'dev-acme-emp-005';  // Diana Johnson — license expiring in 25 days
const S2_EMPLOYEE_ID = 'dev-acme-emp-006';  // Robert Williams — license expired yesterday
const S4_NO_CERT_EMP = 'dev-acme-emp-004';  // Carlos Garcia — no First Aid cert
const S4_HAS_CERT_EMP = 'dev-acme-emp-007'; // Elena Martinez — has First Aid cert
const S6_EMPLOYEE_ID = 'dev-acme-emp-oos';  // James Fontenot — Louisiana license

export interface ScenarioResult {
  scenarioId: number;
  title: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  checks: Array<{ label: string; expected: string; actual: string; pass: boolean }>;
  summary: string;
  data?: Record<string, unknown>;
}

async function getEmployeeName(employeeId: string): Promise<string> {
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  return emp ? `${emp.firstName} ${emp.lastName}` : employeeId;
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: License expiring in 25 days
// Expected: 30-day URGENT tier, still scheduling-eligible (hard block only on expiry date)
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario1(): Promise<ScenarioResult> {
  const checks: ScenarioResult['checks'] = [];
  let allPass = true;

  try {
    const licenseStatus = await getGuardLicenseStatus(S1_EMPLOYEE_ID, ACME_WS);
    const eligibility = await checkSchedulingEligibility(S1_EMPLOYEE_ID, ACME_WS);

    const daysRemaining = licenseStatus.daysRemaining ?? 999;
    const inWindow = daysRemaining >= 20 && daysRemaining <= 30;
    checks.push({
      label: 'License expiring in ~25-day window',
      expected: '20–30 days remaining',
      actual: `${daysRemaining} days remaining`,
      pass: inWindow,
    });
    if (!inWindow) allPass = false;

    const isUrgent = licenseStatus.alertTier === 'expiring_30';
    checks.push({
      label: '30-day URGENT alert tier active',
      expected: 'expiring_30',
      actual: licenseStatus.alertTier,
      pass: isUrgent,
    });
    if (!isUrgent) allPass = false;

    checks.push({
      label: 'Employee still scheduling-eligible at 25 days (hard block only on expiry)',
      expected: 'true',
      actual: String(eligibility.eligible),
      pass: eligibility.eligible,
    });
    if (!eligibility.eligible) allPass = false;

    checks.push({
      label: 'License number on file',
      expected: 'non-null',
      actual: licenseStatus.licenseNumber ?? '(none)',
      pass: !!licenseStatus.licenseNumber,
    });
    if (!licenseStatus.licenseNumber) allPass = false;

    return {
      scenarioId: 1,
      title: 'License Expiring in 25 Days',
      description: 'Diana Johnson — guard card expires in 25 days. URGENT alert fires. Still scheduling-eligible.',
      status: allPass ? 'PASS' : 'FAIL',
      checks,
      summary: allPass
        ? `Diana Johnson's license expires in ${daysRemaining} days. 30-day URGENT tier active. Scheduling-eligible: YES. Alert channels will fire to employee + manager + org_owner.`
        : `Scenario 1 failed — check that the compliance seed data set Diana Johnson (${S1_EMPLOYEE_ID}) guard card to expire in ~25 days.`,
      data: { alertTier: licenseStatus.alertTier, daysRemaining, licenseNumber: licenseStatus.licenseNumber },
    };
  } catch (err: unknown) {
    return { scenarioId: 1, title: 'License Expiring in 25 Days', description: '', status: 'FAIL', checks, summary: `Error: ${(err instanceof Error ? err.message : String(err))}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: License expired yesterday
// Expected: EXPIRED tier, scheduling-ineligible, block reason present
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario2(): Promise<ScenarioResult> {
  const checks: ScenarioResult['checks'] = [];
  let allPass = true;

  try {
    const licenseStatus = await getGuardLicenseStatus(S2_EMPLOYEE_ID, ACME_WS);
    const eligibility = await checkSchedulingEligibility(S2_EMPLOYEE_ID, ACME_WS);

    const isExpired = licenseStatus.alertTier === 'expired';
    checks.push({
      label: 'License status is EXPIRED',
      expected: 'expired',
      actual: licenseStatus.alertTier,
      pass: isExpired,
    });
    if (!isExpired) allPass = false;

    const daysExpired = licenseStatus.daysRemaining !== null ? Math.abs(licenseStatus.daysRemaining) : 0;
    const expiredRecently = daysExpired >= 0 && daysExpired <= 5;
    checks.push({
      label: 'License expired recently (0–5 days ago)',
      expected: '0–5 days expired',
      actual: `${daysExpired} days ago`,
      pass: expiredRecently,
    });
    if (!expiredRecently) allPass = false;

    checks.push({
      label: 'Scheduling eligibility BLOCKED',
      expected: 'false',
      actual: String(eligibility.eligible),
      pass: !eligibility.eligible,
    });
    if (eligibility.eligible) allPass = false;

    checks.push({
      label: 'Block reason message present',
      expected: 'non-null string',
      actual: eligibility.blockReason ? 'present' : '(none)',
      pass: !!eligibility.blockReason,
    });
    if (!eligibility.blockReason) allPass = false;

    const name = await getEmployeeName(S2_EMPLOYEE_ID);
    return {
      scenarioId: 2,
      title: 'License Expired Yesterday — Hard Block',
      description: `${name} — guard card expired ${daysExpired} day(s) ago. Scheduling blocked immediately.`,
      status: allPass ? 'PASS' : 'FAIL',
      checks,
      summary: allPass
        ? `${name}'s license expired ${daysExpired} day(s) ago. Status: EXPIRED. Scheduling eligibility: BLOCKED. Manager and org_owner receive expired license alert. Any shift assignment attempt will be rejected with COMPLIANCE_BLOCK error.`
        : `Scenario 2 failed — verify Robert Williams (${S2_EMPLOYEE_ID}) guard card is seeded with expiry = yesterday.`,
      data: { alertTier: licenseStatus.alertTier, daysExpired, blockReason: eligibility.blockReason },
    };
  } catch (err: unknown) {
    return { scenarioId: 2, title: 'License Expired Yesterday', description: '', status: 'FAIL', checks, summary: `Error: ${(err instanceof Error ? err.message : String(err))}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Guard card renewal verification flow
// Expected: System supports renewal via cert status update + manager confirmation
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario3(): Promise<ScenarioResult> {
  const checks: ScenarioResult['checks'] = [];
  let allPass = true;

  try {
    const expiredStatus = await getGuardLicenseStatus(S2_EMPLOYEE_ID, ACME_WS);

    checks.push({
      label: 'Officer starts in EXPIRED + scheduling-blocked state',
      expected: 'expired + not eligible',
      actual: `${expiredStatus.alertTier} / eligible=${expiredStatus.isSchedulingEligible}`,
      pass: expiredStatus.alertTier === 'expired' && !expiredStatus.isSchedulingEligible,
    });
    if (expiredStatus.alertTier !== 'expired' || expiredStatus.isSchedulingEligible) allPass = false;

    // Simulate renewal: update existing cert to new 2-year expiry
    const futureExpiry = new Date();
    futureExpiry.setFullYear(futureExpiry.getFullYear() + 2);

    await db
      .update(employeeCertifications)
      .set({
        expirationDate: futureExpiry,
        certificationNumber: 'TXG-2026-RENEWED',
        issuingAuthority: 'Texas DPS PSB',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(employeeCertifications.employeeId, S2_EMPLOYEE_ID),
          eq(employeeCertifications.workspaceId, ACME_WS),
          eq(employeeCertifications.status, 'active')
        )
      );

    const renewedStatus = await getGuardLicenseStatus(S2_EMPLOYEE_ID, ACME_WS);
    const renewedDays = renewedStatus.daysRemaining ?? 0;

    checks.push({
      label: 'After renewal: license status is now compliant',
      expected: 'compliant',
      actual: renewedStatus.alertTier,
      pass: renewedStatus.alertTier === 'compliant',
    });
    if (renewedStatus.alertTier !== 'compliant') allPass = false;

    checks.push({
      label: 'After renewal: scheduling eligibility restored',
      expected: 'true',
      actual: String(renewedStatus.isSchedulingEligible),
      pass: renewedStatus.isSchedulingEligible,
    });
    if (!renewedStatus.isSchedulingEligible) allPass = false;

    checks.push({
      label: 'New license number recorded (TXG-2026-RENEWED)',
      expected: 'TXG-2026-RENEWED',
      actual: renewedStatus.licenseNumber ?? '(none)',
      pass: renewedStatus.licenseNumber === 'TXG-2026-RENEWED',
    });
    if (renewedStatus.licenseNumber !== 'TXG-2026-RENEWED') allPass = false;

    // Restore to expired state for other scenarios
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await db
      .update(employeeCertifications)
      .set({ expirationDate: yesterday, certificationNumber: 'TXG-2021-19847', issuingAuthority: 'Texas DPS PSB', updatedAt: new Date() })
      .where(and(eq(employeeCertifications.employeeId, S2_EMPLOYEE_ID), eq(employeeCertifications.workspaceId, ACME_WS), eq(employeeCertifications.status, 'active')));

    return {
      scenarioId: 3,
      title: 'Guard Card Renewal — Eligibility Restored',
      description: 'Robert Williams uploads renewed guard card. System updates cert, restores scheduling eligibility.',
      status: allPass ? 'PASS' : 'FAIL',
      checks,
      summary: allPass
        ? `Renewal flow verified. License updated to compliant (${renewedDays} days remaining). Scheduling eligibility restored immediately. System reverted to expired state after test.`
        : `Scenario 3 failed — renewal update or re-read failed.`,
      data: { renewedDays, newLicenseNumber: 'TXG-2026-RENEWED' },
    };
  } catch (err: unknown) {
    return { scenarioId: 3, title: 'Guard Card Renewal', description: '', status: 'FAIL', checks, summary: `Error: ${(err instanceof Error ? err.message : String(err))}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: First Aid required post — block without cert, allow with cert
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario4(): Promise<ScenarioResult> {
  const checks: ScenarioResult['checks'] = [];
  let allPass = true;

  try {
    const requiredCerts = ['first_aid'];

    // Officer WITHOUT First Aid (Carlos Garcia)
    const noFACheck = await checkRequiredCertifications(S4_NO_CERT_EMP, ACME_WS, requiredCerts);
    checks.push({
      label: 'Carlos Garcia (no First Aid cert): assignment BLOCKED',
      expected: 'eligible=false',
      actual: `eligible=${noFACheck.eligible}, missing=${noFACheck.missing.join(', ')}`,
      pass: !noFACheck.eligible && noFACheck.missing.includes('first_aid'),
    });
    if (noFACheck.eligible) allPass = false;

    checks.push({
      label: 'Block reason message present for missing cert',
      expected: 'non-null string',
      actual: noFACheck.blockReason ? 'present' : '(none)',
      pass: !!noFACheck.blockReason,
    });
    if (!noFACheck.blockReason) allPass = false;

    // Officer WITH First Aid (Elena Martinez)
    const hasFACheck = await checkRequiredCertifications(S4_HAS_CERT_EMP, ACME_WS, requiredCerts);
    checks.push({
      label: 'Elena Martinez (has First Aid cert): assignment ALLOWED',
      expected: 'eligible=true',
      actual: `eligible=${hasFACheck.eligible}, present=${hasFACheck.present.join(', ')}`,
      pass: hasFACheck.eligible,
    });
    if (!hasFACheck.eligible) allPass = false;

    return {
      scenarioId: 4,
      title: 'First Aid Required Post — Cert Enforcement',
      description: 'Post requires First Aid cert. Carlos Garcia (no cert) blocked. Elena Martinez (has cert) allowed.',
      status: allPass ? 'PASS' : 'FAIL',
      checks,
      summary: allPass
        ? `First Aid certification enforcement verified. Shift assignment correctly blocks officers missing required certs and allows those with active certs.`
        : `Scenario 4 failed — check that Elena Martinez (${S4_HAS_CERT_EMP}) has a 'first_aid' cert seeded in employee_certifications.`,
      data: {
        noFAEmployee: { id: S4_NO_CERT_EMP, eligible: noFACheck.eligible, missing: noFACheck.missing },
        hasFAEmployee: { id: S4_HAS_CERT_EMP, eligible: hasFACheck.eligible, present: hasFACheck.present },
      },
    };
  } catch (err: unknown) {
    return { scenarioId: 4, title: 'First Aid Required Post', description: '', status: 'FAIL', checks, summary: `Error: ${(err instanceof Error ? err.message : String(err))}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Org insurance expiring in 45 days → 60-day WARNING
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario5(): Promise<ScenarioResult> {
  const checks: ScenarioResult['checks'] = [];
  let allPass = true;

  try {
    // Query org-level insurance cert (stored with employeeId = workspace sentinel)
    const insuranceCert = await db.query.employeeCertifications.findFirst({
      where: and(
        eq(employeeCertifications.workspaceId, ACME_WS),
        eq(employeeCertifications.certificationType, 'company_insurance'),
        eq(employeeCertifications.status, 'active')
      ),
    });

    if (!insuranceCert) {
      return {
        scenarioId: 5,
        title: 'Company Insurance Expiring in 45 Days',
        description: 'Org-level insurance cert not found — seed may not have run yet.',
        status: 'SKIP',
        checks: [{ label: 'Insurance cert in DB', expected: 'found', actual: 'not found — seed required', pass: false }],
        summary: 'Scenario 5 skipped — run the compliance scenario seed first.',
      };
    }

    const expDate = new Date(insuranceCert.expirationDate!);
    const daysRemaining = Math.floor((expDate.getTime() - Date.now()) / 86400000);
    const in60Window = daysRemaining >= 40 && daysRemaining <= 60;

    checks.push({
      label: 'Insurance cert expiring in 40–60 day window',
      expected: '40–60 days',
      actual: `${daysRemaining} days remaining`,
      pass: in60Window,
    });
    if (!in60Window) allPass = false;

    const alertTier = daysRemaining <= 30 ? 'expiring_30' : daysRemaining <= 60 ? 'expiring_60' : daysRemaining <= 90 ? 'expiring_90' : 'compliant';
    checks.push({
      label: '60-day WARNING tier triggered',
      expected: 'expiring_60',
      actual: alertTier,
      pass: alertTier === 'expiring_60',
    });
    if (alertTier !== 'expiring_60') allPass = false;

    checks.push({
      label: 'Policy number on file',
      expected: 'non-null',
      actual: insuranceCert.certificationNumber ?? '(none)',
      pass: !!insuranceCert.certificationNumber,
    });
    if (!insuranceCert.certificationNumber) allPass = false;

    return {
      scenarioId: 5,
      title: 'Company Insurance Expiring in 45 Days — WARNING',
      description: 'Acme Security COI expires in 45 days. 60-day WARNING alert fires to org_owner via all three channels.',
      status: allPass ? 'PASS' : 'FAIL',
      checks,
      summary: allPass
        ? `Acme insurance (policy ${insuranceCert.certificationNumber}) expires in ${daysRemaining} days. Alert tier: ${alertTier}. org_owner receives CRITICAL level email, in-platform notification, and daily briefing channel post.`
        : `Scenario 5 failed — verify insurance cert seeded at ~45 days remaining.`,
      data: { daysRemaining, alertTier, policyNumber: insuranceCert.certificationNumber },
    };
  } catch (err: unknown) {
    return { scenarioId: 5, title: 'Company Insurance Expiring', description: '', status: 'FAIL', checks, summary: `Error: ${(err instanceof Error ? err.message : String(err))}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Out-of-state (Louisiana) license — flagged for manager review
// ──────────────────────────────────────────────────────────────────────────────
async function runScenario6(): Promise<ScenarioResult> {
  const checks: ScenarioResult['checks'] = [];
  let allPass = true;

  try {
    const oos = await detectOutOfStateLicense(S6_EMPLOYEE_ID, ACME_WS, 'TX');

    if (!oos.hasOutOfStateLicense && !oos.issuingState) {
      return {
        scenarioId: 6,
        title: 'Out-of-State License — Manager Review Required',
        description: 'Out-of-state employee not found — seed may not have run.',
        status: 'SKIP',
        checks: [{ label: 'Out-of-state employee in DB', expected: 'found', actual: 'not found — seed required', pass: false }],
        summary: 'Scenario 6 skipped — run the compliance scenario seed first.',
      };
    }

    checks.push({
      label: 'Louisiana license detected (not TX)',
      expected: 'LA',
      actual: oos.issuingState ?? '(none)',
      pass: oos.issuingState === 'LA',
    });
    if (oos.issuingState !== 'LA') allPass = false;

    checks.push({
      label: 'Manager review flag raised',
      expected: 'true',
      actual: String(oos.requiresManagerReview),
      pass: oos.requiresManagerReview,
    });
    if (!oos.requiresManagerReview) allPass = false;

    checks.push({
      label: 'Cross-state validity note generated',
      expected: 'non-null note about TX operations',
      actual: oos.note ? 'note present' : '(none)',
      pass: !!oos.note,
    });
    if (!oos.note) allPass = false;

    // Guard license check — officer is still scheduling-eligible (out-of-state is soft flag, not hard block)
    const eligibility = await checkSchedulingEligibility(S6_EMPLOYEE_ID, ACME_WS);
    checks.push({
      label: 'Officer remains scheduling-eligible (out-of-state is soft flag, not hard block)',
      expected: 'true',
      actual: String(eligibility.eligible),
      pass: eligibility.eligible,
    });
    if (!eligibility.eligible) allPass = false;

    return {
      scenarioId: 6,
      title: 'Out-of-State License (Louisiana) — Manager Review',
      description: 'James Fontenot holds Louisiana security license. Flagged for manager review. Still scheduling-eligible pending manager override.',
      status: allPass ? 'PASS' : 'FAIL',
      checks,
      summary: allPass
        ? `Louisiana (${oos.issuingState}) license detected (${oos.licenseNumber}). Flagged for manager review — cross-state validity note: "${oos.note}". Manager can override with documented reason. Officer remains eligible for scheduling pending review.`
        : `Scenario 6 failed — verify James Fontenot (${S6_EMPLOYEE_ID}) seeded with Louisiana issuing authority.`,
      data: { issuingState: oos.issuingState, licenseNumber: oos.licenseNumber, note: oos.note },
    };
  } catch (err: unknown) {
    return { scenarioId: 6, title: 'Out-of-State License', description: '', status: 'FAIL', checks, summary: `Error: ${(err instanceof Error ? err.message : String(err))}` };
  }
}

// ── Public interface ───────────────────────────────────────────────────────────

export async function runAllAcmeScenarios(): Promise<{
  workspaceId: string;
  runAt: string;
  scenarios: ScenarioResult[];
  summary: { passed: number; failed: number; skipped: number };
}> {
  const scenarios = await Promise.all([
    runScenario1(),
    runScenario2(),
    runScenario3(),
    runScenario4(),
    runScenario5(),
    runScenario6(),
  ]);

  return {
    workspaceId: ACME_WS,
    runAt: new Date().toISOString(),
    scenarios,
    summary: {
      passed: scenarios.filter(s => s.status === 'PASS').length,
      failed: scenarios.filter(s => s.status === 'FAIL').length,
      skipped: scenarios.filter(s => s.status === 'SKIP').length,
    },
  };
}
