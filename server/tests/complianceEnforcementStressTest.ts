/**
 * Compliance Enforcement + Regulatory Auditor Stress Test
 * =========================================================
 * Validates: 14-day window logic, freeze rules, one-time appeal,
 * support-only lift, auditor portal tables, full session lifecycle.
 *
 * 48 tests across 8 suites — DB-direct approach.
 */

import { db } from '../db';
import {
  complianceWindows,
  accountFreezes,
  freezeAppeals,
  auditorAccounts,
  auditSessions,
  auditorDocumentRequests,
  auditFindings,
  auditorFollowups,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { complianceEnforcementService } from '../services/compliance/complianceEnforcementService';

const DEV_WORKSPACE = 'dev-acme-security-ws';
const DEV_USER      = 'dev-owner-001';

// ── Test runner ──────────────────────────────────────────────────────────────
type TestResult = { name: string; passed: boolean; error?: string };
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (err: unknown) {
    results.push({ name, passed: false, error: err.message });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ── Cleanup helper ───────────────────────────────────────────────────────────
async function cleanupTestEntity(entityId: string) {
  await db.delete(freezeAppeals).where(eq(freezeAppeals.entityId, entityId));
  await db.delete(accountFreezes).where(eq(accountFreezes.entityId, entityId));
  await db.delete(complianceWindows).where(eq(complianceWindows.entityId, entityId));
}

async function cleanupTestAuditor(email: string) {
  const [acct] = await db.select({ id: auditorAccounts.id })
    .from(auditorAccounts).where(eq(auditorAccounts.email, email)).limit(1);
  if (!acct) return;
  const sessions = await db.select({ id: auditSessions.id })
    .from(auditSessions).where(eq(auditSessions.auditorId, acct.id));
  for (const s of sessions) {
    await db.delete(auditorFollowups).where(eq(auditorFollowups.auditSessionId, s.id));
    await db.delete(auditFindings).where(eq(auditFindings.auditSessionId, s.id));
    await db.delete(auditorDocumentRequests).where(eq(auditorDocumentRequests.auditSessionId, s.id));
    await db.delete(auditSessions).where(eq(auditSessions.id, s.id));
  }
  await db.delete(auditorAccounts).where(eq(auditorAccounts.id, acct.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Schema presence
// ─────────────────────────────────────────────────────────────────────────────
async function suiteSchemaPresence() {
  console.log('\n Suite 1: Schema presence');

  await test('compliance_windows table is queryable', async () => {
    await db.select().from(complianceWindows).limit(1);
  });

  await test('account_freezes table is queryable', async () => {
    await db.select().from(accountFreezes).limit(1);
  });

  await test('freeze_appeals table is queryable', async () => {
    await db.select().from(freezeAppeals).limit(1);
  });

  await test('auditor_accounts table is queryable', async () => {
    await db.select().from(auditorAccounts).limit(1);
  });

  await test('audit_sessions table is queryable', async () => {
    await db.select().from(auditSessions).limit(1);
  });

  await test('auditor_document_requests table is queryable', async () => {
    await db.select().from(auditorDocumentRequests).limit(1);
  });

  await test('audit_findings table is queryable', async () => {
    await db.select().from(auditFindings).limit(1);
  });

  await test('auditor_followups table is queryable', async () => {
    await db.select().from(auditorFollowups).limit(1);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Compliance window initialization
// ─────────────────────────────────────────────────────────────────────────────
async function suiteWindowInitialization() {
  console.log('\n Suite 2: Compliance window initialization');
  const entityId = `test-org-${Date.now()}`;

  await test('initializeWindow creates a 14-day window', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization',
      entityId,
      workspaceId: DEV_WORKSPACE,
    });
    assert(!!window.id, 'Window ID should be set');
    const deadline = new Date(window.windowDeadline);
    const start = new Date(window.windowStartedAt);
    const diffDays = (deadline.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    assert(Math.abs(diffDays - 14) < 0.1, `Deadline should be 14 days, got ${diffDays.toFixed(2)}`);
    await cleanupTestEntity(entityId);
  });

  await test('initializeWindow sets correct required docs for org', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization',
      entityId,
      workspaceId: DEV_WORKSPACE,
    });
    const required = window.requiredDocTypes as string[];
    assert(required.includes('coi'), 'org should require coi');
    assert(required.includes('state_license'), 'org should require state_license');
    assert(required.includes('guard_card'), 'org should require guard_card');
    await cleanupTestEntity(entityId);
  });

  await test('initializeWindow sets correct required docs for officer', async () => {
    const officerId = `test-officer-${Date.now()}`;
    await cleanupTestEntity(officerId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'officer',
      entityId: officerId,
      workspaceId: DEV_WORKSPACE,
    });
    const required = window.requiredDocTypes as string[];
    assert(required.includes('guard_card'), 'officer should require guard_card');
    assert(required.includes('i9'), 'officer should require i9');
    await cleanupTestEntity(officerId);
  });

  await test('initializeWindow contractor gets w9 instead of w4', async () => {
    const contractorId = `test-contractor-${Date.now()}`;
    await cleanupTestEntity(contractorId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'officer',
      entityId: contractorId,
      workspaceId: DEV_WORKSPACE,
      isContractor: true,
    });
    const required = window.requiredDocTypes as string[];
    assert(required.includes('w9'), 'contractor should require w9');
    assert(!required.includes('w4'), 'contractor should NOT require w4');
    await cleanupTestEntity(contractorId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Compliance status checks
// ─────────────────────────────────────────────────────────────────────────────
async function suiteStatusChecks() {
  console.log('\n Suite 3: Compliance status checks');
  const entityId = `test-status-${Date.now()}`;

  await test('getComplianceStatus returns null for unknown entity', async () => {
    const status = await complianceEnforcementService.getComplianceStatus('organization', 'nonexistent-entity-xyz');
    assert(status === null, 'Should return null for unknown entity');
  });

  await test('getComplianceStatus returns active status for new window', async () => {
    await cleanupTestEntity(entityId);
    await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    const status = await complianceEnforcementService.getComplianceStatus('organization', entityId);
    assert(status !== null, 'Status should not be null');
    assert(!status!.isFrozen, 'New window should not be frozen');
    assert(!status!.isCompliant, 'New window should not be compliant yet');
    assert(status!.daysRemaining > 0, 'Should have days remaining');
    assert(status!.missingDocTypes.length > 0, 'Should have missing docs');
    assert(status!.phase === 'active', `Expected "active", got "${status!.phase}"`);
    await cleanupTestEntity(entityId);
  });

  await test('getComplianceStatus canAppeal=false when not frozen', async () => {
    await cleanupTestEntity(entityId);
    await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    const status = await complianceEnforcementService.getComplianceStatus('organization', entityId);
    assert(status!.canAppeal === false, 'Should not be able to appeal when not frozen');
    await cleanupTestEntity(entityId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Document approval + auto-compliance
// ─────────────────────────────────────────────────────────────────────────────
async function suiteDocumentApproval() {
  console.log('\n Suite 4: Document approval and auto-compliance');
  const entityId = `test-docs-${Date.now()}`;

  await test('recordDocumentApproved updates approvedDocTypes', async () => {
    await cleanupTestEntity(entityId);
    await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'coi');
    const [window] = await db.select()
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.entityType, 'organization'),
        eq(complianceWindows.entityId, entityId),
      )).limit(1);
    const approved = window.approvedDocTypes as string[];
    assert(approved.includes('coi'), 'coi should be in approvedDocTypes');
    await cleanupTestEntity(entityId);
  });

  await test('recordDocumentApproved marks compliant when all docs approved', async () => {
    await cleanupTestEntity(entityId);
    await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'coi');
    await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'state_license');
    const result = await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'guard_card');
    assert(result.isNowCompliant === true, 'Should be compliant after all docs approved');
    await cleanupTestEntity(entityId);
  });

  await test('getComplianceStatus shows compliant=true after all docs approved', async () => {
    await cleanupTestEntity(entityId);
    await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'coi');
    await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'state_license');
    await complianceEnforcementService.recordDocumentApproved('organization', entityId, 'guard_card');
    const status = await complianceEnforcementService.getComplianceStatus('organization', entityId);
    assert(status!.isCompliant === true, 'Should be compliant');
    assert(status!.isFrozen === false, 'Should not be frozen');
    assert(status!.missingDocTypes.length === 0, 'Should have no missing docs');
    await cleanupTestEntity(entityId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Auto-freeze logic
// ─────────────────────────────────────────────────────────────────────────────
async function suiteAutoFreeze() {
  console.log('\n Suite 5: Auto-freeze logic');
  const entityId = `test-freeze-${Date.now()}`;

  await test('autoFreezeAccount freezes a non-compliant window', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    const result = await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    assert(result.success === true, 'Freeze should succeed');
    assert(!!result.freezeId, 'Should have a freeze ID');
    await cleanupTestEntity(entityId);
  });

  await test('autoFreezeAccount creates account_freeze record', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    const [freeze] = await db.select()
      .from(accountFreezes)
      .where(and(
        eq(accountFreezes.entityType, 'organization'),
        eq(accountFreezes.entityId, entityId),
      )).limit(1);
    assert(!!freeze, 'Freeze record should exist');
    assert(freeze.status === 'active', `Freeze status should be active, got ${freeze.status}`);
    assert(freeze.phase === 'auto_14day', `Freeze phase should be auto_14day, got ${freeze.phase}`);
    await cleanupTestEntity(entityId);
  });

  await test('isEntityFrozen returns true after freeze', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    const frozen = await complianceEnforcementService.isEntityFrozen('organization', entityId);
    assert(frozen === true, 'Entity should be frozen');
    await cleanupTestEntity(entityId);
  });

  await test('autoFreezeAccount returns alreadyFrozen if already frozen', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    const result2 = await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    assert(result2.alreadyFrozen === true, 'Should indicate already frozen');
    await cleanupTestEntity(entityId);
  });

  await test('autoFreezeAccount skips compliant entity', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    // Mark as compliant first
    await db.update(complianceWindows).set({ isCompliant: true } as any).where(eq(complianceWindows.id, window.id));
    const result = await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    assert(result.success === false, 'Should not freeze compliant entity');
    await cleanupTestEntity(entityId);
  });

  await test('getComplianceStatus shows frozen=true + canAppeal=true after freeze', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    const status = await complianceEnforcementService.getComplianceStatus('organization', entityId);
    assert(status!.isFrozen === true, 'Should be frozen');
    assert(status!.canAppeal === true, 'Should be able to appeal (first time)');
    assert(status!.canSubmitHelpdesk === false, 'Should not need helpdesk yet (can still appeal)');
    await cleanupTestEntity(entityId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Appeal logic
// ─────────────────────────────────────────────────────────────────────────────
async function suiteAppealLogic() {
  console.log('\n Suite 6: One-time appeal logic');
  const entityId = `test-appeal-${Date.now()}`;

  await test('submitAppeal auto-approves on first submission', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    const result = await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'Documents are in transit — need 2 more weeks',
      workspaceId: DEV_WORKSPACE,
    });
    assert(result.success === true, `Appeal should succeed: ${result.message}`);
    assert(!!result.appealId, 'Should have an appeal ID');
    assert(!!result.extensionDeadline, 'Should have an extension deadline');
    await cleanupTestEntity(entityId);
  });

  await test('submitAppeal extension is end of current month', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    const result = await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'Need month-end extension',
      workspaceId: DEV_WORKSPACE,
    });
    const ext = new Date(result.extensionDeadline!);
    const now = new Date();
    // Extension should be same month as now (or next if already at end of month)
    assert(ext > now, 'Extension should be in the future');
    // Extension should be end of month (last day of month at 23:59:59)
    const nextDay = new Date(ext.getTime() + 1000); // add 1 second
    assert(nextDay.getDate() === 1, 'Extension should be last day of month (next day is 1st)');
    await cleanupTestEntity(entityId);
  });

  await test('submitAppeal unfreezes account', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'Need more time',
      workspaceId: DEV_WORKSPACE,
    });
    const frozen = await complianceEnforcementService.isEntityFrozen('organization', entityId);
    assert(frozen === false, 'Account should be unfrozen after appeal');
    await cleanupTestEntity(entityId);
  });

  await test('submitAppeal marks appeal_used=true in window', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'Need more time',
      workspaceId: DEV_WORKSPACE,
    });
    const [updated] = await db.select({ appealUsed: complianceWindows.appealUsed })
      .from(complianceWindows)
      .where(and(
        eq(complianceWindows.entityType, 'organization'),
        eq(complianceWindows.entityId, entityId),
      )).limit(1);
    assert(updated.appealUsed === true, 'appeal_used should be true');
    await cleanupTestEntity(entityId);
  });

  await test('submitAppeal fails if appeal already used (one-time rule)', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    // First appeal
    await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'First appeal',
      workspaceId: DEV_WORKSPACE,
    });
    // Force re-freeze for testing
    await db.update(complianceWindows).set({ isFrozen: true } as any)
      .where(and(
        eq(complianceWindows.entityType, 'organization'),
        eq(complianceWindows.entityId, entityId),
      ));
    // Second appeal attempt — should fail
    const result2 = await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'Second attempt — should fail',
      workspaceId: DEV_WORKSPACE,
    });
    assert(result2.success === false, 'Second appeal should fail');
    assert(result2.alreadyUsed === true, 'Should indicate appeal already used');
    await cleanupTestEntity(entityId);
  });

  await test('canSubmitHelpdesk=true after appeal is used and re-frozen', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    await complianceEnforcementService.submitAppeal({
      entityType: 'organization',
      entityId,
      submittedBy: DEV_USER,
      appealReason: 'First and only appeal',
      workspaceId: DEV_WORKSPACE,
    });
    // Force re-freeze to simulate extension expiry
    await db.update(complianceWindows).set({ isFrozen: true } as any)
      .where(and(
        eq(complianceWindows.entityType, 'organization'),
        eq(complianceWindows.entityId, entityId),
      ));
    const status = await complianceEnforcementService.getComplianceStatus('organization', entityId);
    assert(status!.canAppeal === false, 'Appeal used — should not be able to appeal again');
    assert(status!.canSubmitHelpdesk === true, 'Should need helpdesk after appeal exhausted');
    await cleanupTestEntity(entityId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: Support-staff freeze lift
// ─────────────────────────────────────────────────────────────────────────────
async function suiteFreezeLift() {
  console.log('\n Suite 7: Support-staff lift freeze');
  const entityId = `test-lift-${Date.now()}`;

  await test('liftFreeze fails without ticket reference', async () => {
    const result = await complianceEnforcementService.liftFreeze({
      entityType: 'organization',
      entityId: 'test-xyz',
      liftedBy: DEV_USER,
      liftReason: 'Manual review completed',
      relatedTicketId: '',
    });
    assert(result.success === false, 'Should fail without ticket ID');
    assert(result.requiresTicket === true, 'Should indicate ticket required');
  });

  await test('liftFreeze with valid ticket lifts the freeze', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    // First freeze manually
    await db.update(accountFreezes)
      .set({ status: 'active' } as any)
      .where(and(
        eq(accountFreezes.entityType, 'organization'),
        eq(accountFreezes.entityId, entityId),
      ));
    const result = await complianceEnforcementService.liftFreeze({
      entityType: 'organization',
      entityId,
      liftedBy: DEV_USER,
      liftReason: 'Manual review — documents verified by support staff',
      relatedTicketId: 'ST-12345-TEST',
    });
    assert(result.success === true, `Lift should succeed: ${result.message}`);
    await cleanupTestEntity(entityId);
  });

  await test('liftFreeze unfreezes the compliance window', async () => {
    await cleanupTestEntity(entityId);
    const window = await complianceEnforcementService.initializeWindow({
      entityType: 'organization', entityId, workspaceId: DEV_WORKSPACE,
    });
    await complianceEnforcementService.autoFreezeAccount('organization', entityId, window.id);
    await complianceEnforcementService.liftFreeze({
      entityType: 'organization',
      entityId,
      liftedBy: DEV_USER,
      liftReason: 'Verified',
      relatedTicketId: 'ST-99999-TEST',
    });
    const frozen = await complianceEnforcementService.isEntityFrozen('organization', entityId);
    assert(frozen === false, 'Entity should not be frozen after lift');
    await cleanupTestEntity(entityId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: Auditor portal tables
// ─────────────────────────────────────────────────────────────────────────────
async function suiteAuditorPortal() {
  console.log('\n Suite 8: Auditor portal table operations');
  const testEmail = `test-auditor-${Date.now()}@state.gov`;

  await test('auditor_accounts insert', async () => {
    await cleanupTestAuditor(testEmail);
    const [acct] = await db.insert(auditorAccounts).values({
      name: 'Test Auditor',
      email: testEmail,
      agencyName: 'State Bureau of Security',
      stateCode: 'TX',
      isActive: true,
    } as any).returning();
    assert(!!acct.id, 'Should have an ID');
    assert(acct.stateCode === 'TX', 'State code should match');
    await cleanupTestAuditor(testEmail);
  });

  await test('audit_sessions insert with auditor reference', async () => {
    await cleanupTestAuditor(testEmail);
    const [acct] = await db.insert(auditorAccounts).values({
      name: 'Session Test Auditor',
      email: testEmail,
      agencyName: 'TX Regulatory Bureau',
      stateCode: 'TX',
    } as any).returning();
    const [session] = await db.insert(auditSessions).values({
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      sessionLabel: 'Test Audit Session',
      stateCode: 'TX',
      overallOutcome: 'in_progress',
    } as any).returning();
    assert(!!session.id, 'Session should have ID');
    assert(session.stateCode === 'TX', 'State code should match');
    await cleanupTestAuditor(testEmail);
  });

  await test('audit_findings insert within session', async () => {
    await cleanupTestAuditor(testEmail);
    const [acct] = await db.insert(auditorAccounts).values({
      name: 'Findings Test Auditor',
      email: testEmail,
      agencyName: 'TX Regulatory Bureau',
      stateCode: 'TX',
    } as any).returning();
    const [session] = await db.insert(auditSessions).values({
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      sessionLabel: 'Findings Test Session',
      stateCode: 'TX',
      overallOutcome: 'in_progress',
    } as any).returning();
    const [finding] = await db.insert(auditFindings).values({
      auditSessionId: session.id,
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      findingType: 'violation',
      title: 'Missing COI',
      description: 'Certificate of Insurance not provided within the required timeframe',
      severity: 'high',
      fineAmount: 50000, // $500.00
    } as any).returning();
    assert(!!finding.id, 'Finding should have ID');
    assert(finding.findingType === 'violation', 'Finding type should match');
    assert(finding.fineAmount === 50000, 'Fine amount should match');
    await cleanupTestAuditor(testEmail);
  });

  await test('auditor_document_requests insert', async () => {
    await cleanupTestAuditor(testEmail);
    const [acct] = await db.insert(auditorAccounts).values({
      name: 'DocReq Test Auditor',
      email: testEmail,
      agencyName: 'TX Regulatory Bureau',
      stateCode: 'TX',
    } as any).returning();
    const [session] = await db.insert(auditSessions).values({
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      sessionLabel: 'Doc Request Test Session',
      stateCode: 'TX',
      overallOutcome: 'in_progress',
    } as any).returning();
    const [req] = await db.insert(auditorDocumentRequests).values({
      auditSessionId: session.id,
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      requestedDocType: 'coi',
      requestNotes: 'Please provide current COI from 2026',
      status: 'requested',
    } as any).returning();
    assert(!!req.id, 'Request should have ID');
    assert(req.requestedDocType === 'coi', 'Doc type should match');
    assert(req.status === 'requested', 'Status should be requested');
    await cleanupTestAuditor(testEmail);
  });

  await test('auditor_followups insert and complete', async () => {
    await cleanupTestAuditor(testEmail);
    const [acct] = await db.insert(auditorAccounts).values({
      name: 'Followup Test Auditor',
      email: testEmail,
      agencyName: 'TX Regulatory Bureau',
      stateCode: 'TX',
    } as any).returning();
    const [session] = await db.insert(auditSessions).values({
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      sessionLabel: 'Followup Test Session',
      stateCode: 'TX',
      overallOutcome: 'in_progress',
    } as any).returning();
    const scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
    const [followup] = await db.insert(auditorFollowups).values({
      auditSessionId: session.id,
      auditorId: acct.id,
      workspaceId: DEV_WORKSPACE,
      scheduledFor,
      followupType: 'phone_call',
      contactName: 'John Smith',
      contactPhone: '713-555-9999',
      notes: 'Follow up on missing COI submission',
      isCompleted: false,
    } as any).returning();
    assert(!!followup.id, 'Followup should have ID');
    assert(followup.isCompleted === false, 'Followup should not be completed yet');
    // Mark completed
    const [completed] = await db.update(auditorFollowups)
      .set({ isCompleted: true, completedAt: new Date(), outcome: 'COI received and verified' } as any)
      .where(eq(auditorFollowups.id, followup.id))
      .returning();
    assert(completed.isCompleted === true, 'Followup should be completed');
    await cleanupTestAuditor(testEmail);
  });

  await test('getEndOfCurrentMonth returns last day of current month', async () => {
    const endOfMonth = complianceEnforcementService.getEndOfCurrentMonth();
    const now = new Date();
    assert(endOfMonth > now, 'End of month should be in the future');
    const nextDay = new Date(endOfMonth.getTime() + 1000);
    assert(nextDay.getDate() === 1, 'Next second after end-of-month should be 1st of next month');
    assert(endOfMonth.getHours() === 23, 'End of month should be at 23 hours');
    assert(endOfMonth.getMinutes() === 59, 'End of month should be at 59 minutes');
  });

  await test('checkAssignmentAllowed returns allowed=true for non-frozen entities', async () => {
    const result = await complianceEnforcementService.checkAssignmentAllowed({
      officerEntityId: 'nonexistent-officer-xyz-test',
      orgWorkspaceId: 'nonexistent-org-xyz-test',
    });
    // Non-frozen (no window) → isEntityFrozen returns false → allowed
    assert(result.allowed === true, 'Should be allowed for entities without compliance windows');
  });

  await test('compliance enforcement routes file exports default router', async () => {
    // complianceRoutes deleted in refactor — test disabled
    // const mod = await import('../routes/complianceRoutes');
    assert(!!mod.default, 'Should export default router');
    assert(typeof mod.default === 'function' || typeof (mod as any).default.use === 'function',
      'Should be an express Router');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('COMPLIANCE ENFORCEMENT STRESS TEST');
  console.log('════════════════════════════════════════════════════════════');

  await suiteSchemaPresence();
  await suiteWindowInitialization();
  await suiteStatusChecks();
  await suiteDocumentApproval();
  await suiteAutoFreeze();
  await suiteAppealLogic();
  await suiteFreezeLift();
  await suiteAuditorPortal();

  // Print results
  console.log('\n════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  if (failed === 0) {
    console.log(`COMPLIANCE ENFORCEMENT STRESS TEST — ${passed}/${total} PASSED`);
  } else {
    console.log(`COMPLIANCE ENFORCEMENT STRESS TEST — ${passed}/${total} PASSED (${failed} FAILED)`);
  }
  console.log('════════════════════════════════════════════════════════════');

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}${r.error ? ` → ${r.error}` : ''}`);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`\nFinal: ${passed}/${total} passed (${failed} failed)`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
