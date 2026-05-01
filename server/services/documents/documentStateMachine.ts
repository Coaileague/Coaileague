/**
 * DOCUMENT STATE MACHINE
 * ======================
 * Enforces the canonical document status lifecycle for document_instances.
 *
 * Legal status flow:
 *   draft → pending_signature → partially_signed → executed → expired | voided | archived
 *
 * Terminal states (no transitions out):
 *   - voided
 *   - expired
 *
 * All transitions are logged via universalAudit.
 */

import { db } from '../../db';
import { documentInstances } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { universalAudit } from '../universalAuditService';
import { createLogger } from '../../lib/logger';
const log = createLogger('documentStateMachine');


export type DocumentStatus =
  | 'draft'
  | 'pending_signature'
  | 'partially_signed'
  | 'executed'
  | 'expired'
  | 'voided'
  | 'archived';

const TERMINAL_STATES: Set<DocumentStatus> = new Set(['voided', 'expired']);

const ALLOWED_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ['pending_signature', 'voided'],
  pending_signature: ['partially_signed', 'executed', 'voided'],
  partially_signed: ['executed', 'voided'],
  executed: ['expired', 'voided', 'archived'],
  expired: [],
  voided: [],
  archived: [],
};

export interface TransitionResult {
  success: boolean;
  newStatus?: DocumentStatus;
  error?: string;
}

export async function transitionDocumentStatus(params: {
  documentId: string;
  workspaceId: string;
  fromStatus: DocumentStatus;
  toStatus: DocumentStatus;
  actorId: string;
  reason?: string;
}): Promise<TransitionResult> {
  const { documentId, workspaceId, fromStatus, toStatus, actorId, reason } = params;

  if (TERMINAL_STATES.has(fromStatus)) {
    return {
      success: false,
      error: `Document status '${fromStatus}' is terminal — no transitions allowed.`,
    };
  }

  const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    return {
      success: false,
      error: `Transition '${fromStatus}' → '${toStatus}' is not permitted. Allowed: [${allowed.join(', ')}]`,
    };
  }

  const updateValues: Record<string, unknown> = {
    status: toStatus,
    updatedAt: new Date(),
  };

  if (toStatus === 'voided') {
    updateValues.voidedAt = new Date();
    updateValues.voidedBy = actorId;
    if (reason) updateValues.voidedReason = reason;
  }

  if (toStatus === 'executed') {
    updateValues.completedAt = new Date();
  }

  const [updated] = await db
    .update(documentInstances)
    .set(updateValues)
    .where(
      and(
        eq(documentInstances.id, documentId),
        eq(documentInstances.workspaceId, workspaceId),
        eq(documentInstances.status, fromStatus)
      )
    )
    .returning();

  if (!updated) {
    return {
      success: false,
      error: `Document ${documentId} not found, not in workspace ${workspaceId}, or status has already changed from '${fromStatus}'.`,
    };
  }

  await universalAudit.log({
    workspaceId,
    actorId,
    actorType: 'user',
    changeType: 'update',
    action: 'DOCUMENT:STATUS_TRANSITION',
    entityType: 'document_instance',
    entityId: documentId,
    entityName: updated.title,
    metadata: {
      fromStatus,
      toStatus,
      reason: reason ?? null,
      transitionedAt: new Date().toISOString(),
    },
  });

  return { success: true, newStatus: toStatus };
}

export async function assertNotTerminal(documentId: string, workspaceId: string): Promise<{ blocked: boolean; status?: DocumentStatus; error?: string }> {
  const doc = await db.query.documentInstances.findFirst({
    where: and(
      eq(documentInstances.id, documentId),
      eq(documentInstances.workspaceId, workspaceId)
    ),
    columns: { status: true, title: true },
  });

  if (!doc) return { blocked: true, error: 'Document not found' };
  const status = doc.status as DocumentStatus;

  if (TERMINAL_STATES.has(status)) {
    return {
      blocked: true,
      status,
      error: `Document is in terminal state '${status}' — action not permitted`,
    };
  }

  return { blocked: false, status };
}

export async function runDocumentExpiryCheck(): Promise<void> {
  const now = new Date();

  const expired = await db.query.documentInstances.findMany({
    where: (t, { and, lte, notInArray, isNotNull }) =>
      and(
        isNotNull(t.expiresAt),
        lte(t.expiresAt!, now),
        notInArray(t.status, ['expired', 'voided', 'archived'])
      ),
    columns: { id: true, workspaceId: true, status: true, title: true, relatedEntityId: true, relatedEntityType: true },
  });

  log.info(`[DocStateMachine] Expiry check: ${expired.length} documents to expire`);

  for (const doc of expired) {
    await transitionDocumentStatus({
      documentId: doc.id,
      workspaceId: doc.workspaceId,
      fromStatus: doc.status as DocumentStatus,
      toStatus: 'expired',
      actorId: 'system:expiry-check',
      reason: 'Passed expiration date — auto-expired by scheduled check',
    });
  }
}
