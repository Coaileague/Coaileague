/**
 * PHASE 4C: Time Entry Dispute Resolution Service
 * Handles approval/rejection workflow for disputed time entries
 */

import { db } from "../db";
import { disputes, timeEntries, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('timeEntryDisputeService');


export interface DisputeApprovalRequest {
  disputeId: string;
  approvedBy: string;
  resolution: string;
  resolutionAction?: string;
}

export interface DisputeRejectionRequest {
  disputeId: string;
  rejectedBy: string;
  resolution: string;
  canBeAppealed?: boolean;
}

/**
 * Approve a time entry dispute and apply changes
 */
export async function approveDispute(
  request: DisputeApprovalRequest
): Promise<any> {
  const dispute = await db
    .update(disputes)
    .set({
      status: 'approved',
      resolvedBy: request.approvedBy,
      resolvedAt: new Date(),
      resolution: request.resolution,
      resolutionAction: request.resolutionAction,
      changesApplied: true,
      changesAppliedAt: new Date(),
    })
    .where(eq(disputes.id, request.disputeId))
    .returning();

  if (!dispute[0]) throw new Error(`Dispute ${request.disputeId} not found`);

  log.info(`[TIME ENTRY DISPUTE] Dispute ${request.disputeId} approved`);
  return dispute[0];
}

/**
 * Reject a time entry dispute
 */
export async function rejectDispute(
  request: DisputeRejectionRequest
): Promise<any> {
  const dispute = await db
    .update(disputes)
    .set({
      status: 'rejected',
      resolvedBy: request.rejectedBy,
      resolvedAt: new Date(),
      resolution: request.resolution,
      canBeAppealed: request.canBeAppealed ?? true,
      appealDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    })
    .where(eq(disputes.id, request.disputeId))
    .returning();

  if (!dispute[0]) throw new Error(`Dispute ${request.disputeId} not found`);

  log.info(`[TIME ENTRY DISPUTE] Dispute ${request.disputeId} rejected`);
  return dispute[0];
}

/**
 * Get pending disputes for a workspace
 */
export async function getPendingDisputes(workspaceId: string): Promise<any[]> {
  return db
    .select()
    .from(disputes)
    .where(
      and(
        eq(disputes.workspaceId, workspaceId),
        eq(disputes.status, 'pending')
      )
    );
}

/**
 * Get disputes assigned to a user
 */
export async function getDisputesAssignedToUser(userId: string): Promise<any[]> {
  return db
    .select()
    .from(disputes)
    .where(eq(disputes.assignedTo, userId));
}
