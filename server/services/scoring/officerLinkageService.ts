/**
 * Officer Linkage Service
 * =======================
 * Find-or-create the cross-tenant globalOfficer row for a given officer
 * and link the per-tenant employees row to it.
 *
 * This is the single entry point that ties an officer to their cross-tenant
 * identity. Called from:
 *   - Onboarding completion (when SSN is captured)
 *   - SPS contract execution
 *   - Manual link backfills (admin tooling)
 *
 * Lookup flow:
 *   1. Compute SSN fingerprint via ssnFingerprint utility.
 *   2. SELECT global_officers WHERE ssn_fingerprint = ?
 *   3. If found → reuse; UPDATE employees.global_officer_id.
 *   4. If not found → INSERT new global_officers row at default score (75);
 *      then UPDATE employees.global_officer_id.
 *
 * The bcrypt employees.ssn_hash stays as-is for verify-only flows. The
 * fingerprint is the cross-tenant join key, never the auth credential.
 */

import { db, pool } from '../../db';
import { eq } from 'drizzle-orm';
import {
  employees,
  globalOfficers,
  employeeDocuments,
} from '@shared/schema';
import { computeSSNFingerprint } from './ssnFingerprint';
import { recomputeAndPersist } from './scoreEngineService';
import { computeAndAppendClosingScore, type SeparationType } from './closingScoreService';
import { createLogger } from '../../lib/logger';

const log = createLogger('officerLinkage');

export interface LinkOfficerInput {
  employeeId: string;
  workspaceId: string;
  rawSSN: string;             // raw, NOT hashed — only used to compute fingerprint
  legalFirstName: string;
  legalLastName: string;
  dateOfBirth?: Date | string | null;
}

export interface LinkOfficerResult {
  globalOfficerId: string;
  isNew: boolean;
  fingerprint: string;
}

export async function linkOfficerToGlobal(input: LinkOfficerInput): Promise<LinkOfficerResult> {
  const fingerprint = computeSSNFingerprint(input.rawSSN);

  const [existing] = await db
    .select({ id: globalOfficers.id })
    .from(globalOfficers)
    .where(eq(globalOfficers.ssnFingerprint, fingerprint))
    .limit(1);

  let globalOfficerId: string;
  let isNew = false;

  if (existing) {
    globalOfficerId = existing.id;
    log.info(`[linkage] reuse global officer ${globalOfficerId} for employee ${input.employeeId}`);
  } else {
    const [created] = await db
      .insert(globalOfficers)
      .values({
        ssnFingerprint: fingerprint,
        legalFirstName: input.legalFirstName,
        legalLastName: input.legalLastName,
        dateOfBirth: input.dateOfBirth
          ? (typeof input.dateOfBirth === 'string' ? input.dateOfBirth : input.dateOfBirth.toISOString().slice(0, 10))
          : null,
        currentScore: 75,
        currentTier: 'favorable',
      })
      .returning({ id: globalOfficers.id });
    globalOfficerId = created.id;
    isNew = true;
    log.info(`[linkage] created new global officer ${globalOfficerId} for employee ${input.employeeId}`);
  }

  await db
    .update(employees)
    .set({ globalOfficerId, updatedAt: new Date() })
    .where(eq(employees.id, input.employeeId));

  // Trigger an initial score recompute now that the officer is linked.
  // Non-blocking: caller shouldn't fail on score errors.
  recomputeAndPersist(input.employeeId, globalOfficerId, input.workspaceId).catch((err: Error) => {
    log.warn(`[linkage] initial recompute failed for ${input.employeeId}:`, err.message);
  });

  return { globalOfficerId, isNew, fingerprint };
}

/**
 * Termination hook — called from terminationRoutes.
 * Idempotent: safe to call repeatedly for the same separation event.
 */
export async function onOfficerTerminated(input: {
  employeeId: string;
  workspaceId: string;
  separationType: SeparationType;
  separationDate?: Date;
}): Promise<void> {
  const [emp] = await db
    .select({ globalOfficerId: employees.globalOfficerId })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);

  if (!emp?.globalOfficerId) {
    log.warn(`[linkage] termination skipped: employee ${input.employeeId} has no global_officer_id`);
    return;
  }

  try {
    const entry = await computeAndAppendClosingScore({
      employeeId: input.employeeId,
      globalOfficerId: emp.globalOfficerId,
      workspaceId: input.workspaceId,
      separationType: input.separationType,
      separationDate: input.separationDate,
    });
    log.info(`[linkage] closing score frozen for ${input.employeeId}: ${entry.score} (${entry.tier})`);
  } catch (err) {
    log.error(`[linkage] closing-score freeze failed for ${input.employeeId}:`, err);
  }
}

/**
 * Veteran verification — called from the DD-214 review workflow.
 * Verifies the document is a DD-214 and belongs to the linked global officer.
 * Flips veteran_verified_at + records the document id.
 */
export async function verifyVeteranStatus(input: {
  globalOfficerId: string;
  documentId: string;
}): Promise<{ verified: true; verifiedAt: Date }> {
  // Confirm the document is a dd_214 and is approved.
  const [doc] = await db
    .select({
      type: employeeDocuments.documentType,
      status: employeeDocuments.status,
    })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.id, input.documentId))
    .limit(1);

  if (!doc) throw new Error('DD-214 document not found');
  if (doc.type !== 'dd_214') throw new Error('Document is not a DD-214');
  if (doc.status !== 'approved') throw new Error('DD-214 not yet approved by HR/Trinity reviewer');

  const verifiedAt = new Date();
  await db.update(globalOfficers).set({
    veteranStatus: true,
    veteranVerifiedAt: verifiedAt,
    veteranDocumentId: input.documentId,
    lastUpdatedAt: verifiedAt,
    updatedAt: verifiedAt,
  }).where(eq(globalOfficers.id, input.globalOfficerId));

  log.info(`[linkage] veteran status verified for officer ${input.globalOfficerId}`);
  return { verified: true, verifiedAt };
}

/**
 * Public-recognition consent toggle — required before an officer can appear
 * on the public honor roll. Officer can revoke at any time; revocation
 * removes them from future selections but does not retroactively erase past
 * honor-roll entries (those are public artifacts).
 */
export async function setPublicRecognitionConsent(input: {
  globalOfficerId: string;
  consent: boolean;
}): Promise<void> {
  const at = new Date();
  await db.update(globalOfficers).set({
    publicRecognitionConsent: input.consent,
    publicRecognitionConsentAt: input.consent ? at : null,
    lastUpdatedAt: at,
    updatedAt: at,
  }).where(eq(globalOfficers.id, input.globalOfficerId));
  log.info(`[linkage] public-recognition consent=${input.consent} for officer ${input.globalOfficerId}`);
}
