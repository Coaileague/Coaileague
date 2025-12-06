/**
 * CommitmentManager - Intent/Lock tracking and transaction boundaries
 * 
 * Provides:
 * - Intent declaration before actions
 * - Resource locking for exclusive access
 * - Compensation/rollback handlers
 * - Transaction boundaries for multi-step workflows
 * - Atomic persist-then-publish patterns
 */

import { db } from '../../db';
import { 
  commitmentLedger,
  InsertCommitmentLedger,
  CommitmentLedger
} from '@shared/schema';
import { eq, and, lte, inArray, sql } from 'drizzle-orm';
import { aiBrainEvents } from './internalEventEmitter';

export type CommitmentType = 'intent' | 'lock' | 'reservation' | 'approval_pending' | 'committed' | 'rolled_back';
export type CommitmentStatus = 'pending' | 'active' | 'fulfilled' | 'cancelled' | 'compensated';

export interface CommitmentContext {
  workspaceId?: string;
  userId?: string;
  runId?: string;
}

export interface LockOptions {
  expiresInMs?: number;
  waitForLock?: boolean;
  maxWaitMs?: number;
}

class CommitmentManagerService {
  private static instance: CommitmentManagerService;
  private activeLocks: Map<string, string> = new Map();

  private constructor() {
    this.startLockCleanup();
  }

  static getInstance(): CommitmentManagerService {
    if (!CommitmentManagerService.instance) {
      CommitmentManagerService.instance = new CommitmentManagerService();
    }
    return CommitmentManagerService.instance;
  }

  private startLockCleanup() {
    setInterval(async () => {
      await this.cleanupExpiredLocks();
    }, 60000);
  }

  async declareIntent(
    context: CommitmentContext,
    resourceType: string,
    resourceId: string,
    description: string,
    commitmentData?: Record<string, any>
  ): Promise<CommitmentLedger> {
    const [commitment] = await db.insert(commitmentLedger).values({
      workspaceId: context.workspaceId,
      userId: context.userId,
      runId: context.runId,
      commitmentType: 'intent',
      resourceType,
      resourceId,
      description,
      commitmentData,
      status: 'pending',
    }).returning();

    console.log(`[CommitmentManager] Intent declared: ${resourceType}/${resourceId}`);
    return commitment;
  }

  async acquireLock(
    context: CommitmentContext,
    resourceType: string,
    resourceId: string,
    options?: LockOptions
  ): Promise<CommitmentLedger | null> {
    const lockKey = `${resourceType}:${resourceId}`;
    const expiresAt = new Date(Date.now() + (options?.expiresInMs || 30000));

    const existingLock = await db.select()
      .from(commitmentLedger)
      .where(and(
        eq(commitmentLedger.resourceType, resourceType),
        eq(commitmentLedger.resourceId, resourceId),
        eq(commitmentLedger.commitmentType, 'lock'),
        eq(commitmentLedger.status, 'active')
      ))
      .limit(1);

    if (existingLock.length > 0) {
      const lock = existingLock[0];
      if (lock.expiresAt && new Date(lock.expiresAt) > new Date()) {
        console.log(`[CommitmentManager] Lock already held for ${lockKey}`);
        return null;
      }
      await this.releaseLock(lock.id);
    }

    const [lock] = await db.insert(commitmentLedger).values({
      workspaceId: context.workspaceId,
      userId: context.userId,
      runId: context.runId,
      commitmentType: 'lock',
      resourceType,
      resourceId,
      description: `Lock for ${resourceType}/${resourceId}`,
      status: 'active',
      expiresAt,
    }).returning();

    this.activeLocks.set(lockKey, lock.id);
    console.log(`[CommitmentManager] Lock acquired: ${lockKey} (expires: ${expiresAt.toISOString()})`);
    
    return lock;
  }

  async releaseLock(lockId: string): Promise<boolean> {
    const [lock] = await db.update(commitmentLedger)
      .set({
        status: 'fulfilled',
        resolvedAt: new Date(),
        resolutionReason: 'Released',
        updatedAt: new Date()
      })
      .where(and(
        eq(commitmentLedger.id, lockId),
        eq(commitmentLedger.commitmentType, 'lock')
      ))
      .returning();

    if (lock) {
      const lockKey = `${lock.resourceType}:${lock.resourceId}`;
      this.activeLocks.delete(lockKey);
      console.log(`[CommitmentManager] Lock released: ${lockKey}`);
      return true;
    }

    return false;
  }

  async commit(
    commitmentId: string,
    compensationData?: Record<string, any>
  ): Promise<CommitmentLedger | undefined> {
    const [commitment] = await db.update(commitmentLedger)
      .set({
        commitmentType: 'committed',
        status: 'fulfilled',
        compensationData,
        resolvedAt: new Date(),
        resolutionReason: 'Committed successfully',
        updatedAt: new Date()
      })
      .where(eq(commitmentLedger.id, commitmentId))
      .returning();

    if (commitment) {
      aiBrainEvents.emit('commitment_fulfilled', {
        commitmentId,
        resourceType: commitment.resourceType,
        resourceId: commitment.resourceId,
      });
    }

    return commitment;
  }

  async rollback(
    commitmentId: string,
    reason: string
  ): Promise<CommitmentLedger | undefined> {
    const [commitment] = await db.select()
      .from(commitmentLedger)
      .where(eq(commitmentLedger.id, commitmentId));

    if (!commitment) return undefined;

    if (commitment.compensationData) {
      aiBrainEvents.emit('compensation_required', {
        commitmentId,
        resourceType: commitment.resourceType,
        resourceId: commitment.resourceId,
        compensationData: commitment.compensationData,
      });
    }

    const [updated] = await db.update(commitmentLedger)
      .set({
        commitmentType: 'rolled_back',
        status: 'compensated',
        resolvedAt: new Date(),
        resolutionReason: reason,
        updatedAt: new Date()
      })
      .where(eq(commitmentLedger.id, commitmentId))
      .returning();

    console.log(`[CommitmentManager] Rolled back: ${commitment.resourceType}/${commitment.resourceId}`);
    return updated;
  }

  async createReservation(
    context: CommitmentContext,
    resourceType: string,
    resourceId: string,
    reservationData: Record<string, any>,
    expiresInMs: number = 300000
  ): Promise<CommitmentLedger> {
    const [reservation] = await db.insert(commitmentLedger).values({
      workspaceId: context.workspaceId,
      userId: context.userId,
      runId: context.runId,
      commitmentType: 'reservation',
      resourceType,
      resourceId,
      description: `Reservation for ${resourceType}/${resourceId}`,
      commitmentData: reservationData,
      status: 'active',
      expiresAt: new Date(Date.now() + expiresInMs),
    }).returning();

    return reservation;
  }

  async requestApproval(
    context: CommitmentContext,
    resourceType: string,
    resourceId: string,
    description: string,
    approvalData: Record<string, any>
  ): Promise<CommitmentLedger> {
    const [approval] = await db.insert(commitmentLedger).values({
      workspaceId: context.workspaceId,
      userId: context.userId,
      runId: context.runId,
      commitmentType: 'approval_pending',
      resourceType,
      resourceId,
      description,
      commitmentData: approvalData,
      status: 'pending',
    }).returning();

    aiBrainEvents.emit('approval_requested', {
      commitmentId: approval.id,
      resourceType,
      resourceId,
      description,
      workspaceId: context.workspaceId,
    });

    return approval;
  }

  async approveCommitment(
    commitmentId: string,
    approvedBy: string
  ): Promise<CommitmentLedger | undefined> {
    const [commitment] = await db.update(commitmentLedger)
      .set({
        status: 'active',
        resolvedBy: approvedBy,
        resolvedAt: new Date(),
        resolutionReason: `Approved by ${approvedBy}`,
        updatedAt: new Date()
      })
      .where(and(
        eq(commitmentLedger.id, commitmentId),
        eq(commitmentLedger.commitmentType, 'approval_pending')
      ))
      .returning();

    if (commitment) {
      aiBrainEvents.emit('approval_granted', {
        commitmentId,
        approvedBy,
        resourceType: commitment.resourceType,
        resourceId: commitment.resourceId,
      });
    }

    return commitment;
  }

  async rejectCommitment(
    commitmentId: string,
    rejectedBy: string,
    reason: string
  ): Promise<CommitmentLedger | undefined> {
    const [commitment] = await db.update(commitmentLedger)
      .set({
        status: 'cancelled',
        resolvedBy: rejectedBy,
        resolvedAt: new Date(),
        resolutionReason: reason,
        updatedAt: new Date()
      })
      .where(and(
        eq(commitmentLedger.id, commitmentId),
        eq(commitmentLedger.commitmentType, 'approval_pending')
      ))
      .returning();

    if (commitment) {
      aiBrainEvents.emit('approval_rejected', {
        commitmentId,
        rejectedBy,
        reason,
        resourceType: commitment.resourceType,
        resourceId: commitment.resourceId,
      });
    }

    return commitment;
  }

  async getActiveCommitments(context: CommitmentContext): Promise<CommitmentLedger[]> {
    const conditions = [
      inArray(commitmentLedger.status, ['pending', 'active'])
    ];

    if (context.workspaceId) {
      conditions.push(eq(commitmentLedger.workspaceId, context.workspaceId));
    }
    if (context.runId) {
      conditions.push(eq(commitmentLedger.runId, context.runId));
    }

    return db.select()
      .from(commitmentLedger)
      .where(and(...conditions));
  }

  async getPendingApprovals(workspaceId?: string): Promise<CommitmentLedger[]> {
    const conditions = [
      eq(commitmentLedger.commitmentType, 'approval_pending'),
      eq(commitmentLedger.status, 'pending')
    ];

    if (workspaceId) {
      conditions.push(eq(commitmentLedger.workspaceId, workspaceId));
    }

    return db.select()
      .from(commitmentLedger)
      .where(and(...conditions));
  }

  private async cleanupExpiredLocks(): Promise<number> {
    const result = await db.update(commitmentLedger)
      .set({
        status: 'cancelled',
        resolvedAt: new Date(),
        resolutionReason: 'Expired',
        updatedAt: new Date()
      })
      .where(and(
        eq(commitmentLedger.commitmentType, 'lock'),
        eq(commitmentLedger.status, 'active'),
        lte(commitmentLedger.expiresAt, new Date())
      ));

    if (result.rowCount && result.rowCount > 0) {
      console.log(`[CommitmentManager] Cleaned up ${result.rowCount} expired locks`);
    }

    return result.rowCount || 0;
  }

  async withTransaction<T>(
    context: CommitmentContext,
    resourceType: string,
    resourceId: string,
    operation: (commitmentId: string) => Promise<T>,
    compensate?: (error: Error) => Promise<void>
  ): Promise<T> {
    const commitment = await this.declareIntent(
      context,
      resourceType,
      resourceId,
      `Transaction for ${resourceType}/${resourceId}`
    );

    try {
      const result = await operation(commitment.id);
      await this.commit(commitment.id, { originalState: result });
      return result;
    } catch (error) {
      await this.rollback(commitment.id, error instanceof Error ? error.message : 'Unknown error');
      if (compensate) {
        await compensate(error instanceof Error ? error : new Error('Unknown error'));
      }
      throw error;
    }
  }
}

export const commitmentManager = CommitmentManagerService.getInstance();
