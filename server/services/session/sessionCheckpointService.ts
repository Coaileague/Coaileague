/**
 * Session Checkpoint Service - Trinity-Aware Session State Management
 * 
 * Provides phased session checkpointing to prevent data loss and enable
 * session recovery. Integrated with AI Brain for context awareness.
 */

import { db } from '../../db';
import { 
  sessionCheckpoints, 
  sessionRecoveryRequests,
  type InsertSessionCheckpoint,
  type SessionCheckpoint
} from '@shared/schema';
import { eq, and, desc, isNull, lt, or, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('sessionCheckpointService');


export interface CheckpointPayload {
  formData?: Record<string, any>;
  pageState?: Record<string, any>;
  userInputs?: Record<string, any>;
  customData?: Record<string, any>;
}

export interface CreateCheckpointParams {
  userId: string;
  workspaceId?: string;
  sessionId: string;
  phaseKey: string;
  payload: CheckpointPayload;
  pageRoute?: string;
  contextSummary?: string;
  actionHistory?: any[];
}

export interface UpdateCheckpointParams {
  checkpointId: string;
  payload?: CheckpointPayload;
  phaseKey?: string;
  contextSummary?: string;
  actionHistory?: any[];
}

class SessionCheckpointService {
  private static instance: SessionCheckpointService;
  
  private constructor() {
    log.info('[SessionCheckpoint] Service initialized');
  }
  
  static getInstance(): SessionCheckpointService {
    if (!SessionCheckpointService.instance) {
      SessionCheckpointService.instance = new SessionCheckpointService();
    }
    return SessionCheckpointService.instance;
  }
  
  /**
   * Generate checksum for payload integrity verification
   */
  private generateChecksum(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
  
  /**
   * Create a new session checkpoint
   */
  async createCheckpoint(params: CreateCheckpointParams): Promise<SessionCheckpoint> {
    const checksum = this.generateChecksum(params.payload);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const [checkpoint] = await db.insert(sessionCheckpoints).values({
      userId: params.userId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      phaseKey: params.phaseKey,
      payload: params.payload,
      payloadChecksum: checksum,
      pageRoute: params.pageRoute,
      contextSummary: params.contextSummary || `User working on ${params.phaseKey}`,
      actionHistory: params.actionHistory,
      expiresAt,
    }).returning();
    
    // Log the event
    await this.logEvent(checkpoint.id, 'created', 'user_action', {
      phaseKey: params.phaseKey,
      pageRoute: params.pageRoute,
    });
    
    // Notify AI Brain
    this.notifyTrinity(checkpoint, 'checkpoint_created');
    
    log.info(`[SessionCheckpoint] Created checkpoint ${checkpoint.id} for user ${params.userId}`);
    return checkpoint;
  }
  
  /**
   * Update an existing checkpoint
   */
  async updateCheckpoint(params: UpdateCheckpointParams): Promise<SessionCheckpoint | null> {
    const existing = await db.query.sessionCheckpoints.findFirst({
      where: eq(sessionCheckpoints.id, params.checkpointId),
    });
    
    if (!existing || existing.isFinal) {
      return null;
    }
    
    const previousChecksum = existing.payloadChecksum;
    const newPayload = params.payload || existing.payload;
    const newChecksum = this.generateChecksum(newPayload);
    
    const [updated] = await db.update(sessionCheckpoints)
      .set({
        payload: newPayload,
        payloadChecksum: newChecksum,
        payloadVersion: (existing.payloadVersion || 1) + 1,
        phaseKey: params.phaseKey || existing.phaseKey,
        contextSummary: params.contextSummary || existing.contextSummary,
        actionHistory: params.actionHistory || existing.actionHistory,
        savedAt: new Date(),
        updatedAt: new Date(),
        aiSyncState: 'pending',
      })
      .where(eq(sessionCheckpoints.id, params.checkpointId))
      .returning();
    
    // Log the event
    await this.logEvent(params.checkpointId, 'updated', 'auto_save', {
      previousChecksum,
      newChecksum,
      version: updated.payloadVersion,
    });
    
    // Sync with Trinity periodically (not on every update)
    if ((updated.payloadVersion || 0) % 5 === 0) {
      this.notifyTrinity(updated, 'checkpoint_updated');
    }
    
    return updated;
  }
  
  /**
   * Finalize a checkpoint (graceful session end)
   */
  async finalizeCheckpoint(checkpointId: string, source: string = 'user_action'): Promise<boolean> {
    const [updated] = await db.update(sessionCheckpoints)
      .set({
        isFinal: true,
        updatedAt: new Date(),
        aiSyncState: 'synced',
        aiSyncedAt: new Date(),
      })
      .where(eq(sessionCheckpoints.id, checkpointId))
      .returning();
    
    if (updated) {
      await this.logEvent(checkpointId, 'finalized', source, {});
      this.notifyTrinity(updated, 'checkpoint_finalized');
      log.info(`[SessionCheckpoint] Finalized checkpoint ${checkpointId}`);
      return true;
    }
    return false;
  }
  
  /**
   * Get the latest non-finalized checkpoint for a user
   */
  async getActiveCheckpoint(userId: string, sessionId?: string): Promise<SessionCheckpoint | null> {
    const conditions = [
      eq(sessionCheckpoints.userId, userId),
      eq(sessionCheckpoints.isFinal, false),
    ];
    
    if (sessionId) {
      conditions.push(eq(sessionCheckpoints.sessionId, sessionId));
    }
    
    const checkpoint = await db.query.sessionCheckpoints.findFirst({
      where: and(...conditions),
      orderBy: [desc(sessionCheckpoints.savedAt)],
    });
    
    return checkpoint || null;
  }
  
  /**
   * Get recoverable checkpoints for a user (for session recovery)
   */
  async getRecoverableCheckpoints(userId: string): Promise<SessionCheckpoint[]> {
    const checkpoints = await db.query.sessionCheckpoints.findMany({
      where: and(
        eq(sessionCheckpoints.userId, userId),
        eq(sessionCheckpoints.isFinal, false),
        eq(sessionCheckpoints.isRecovered, false),
      ),
      orderBy: [desc(sessionCheckpoints.savedAt)],
      limit: 5,
    });
    
    return checkpoints;
  }
  
  /**
   * Create a recovery request
   */
  async createRecoveryRequest(
    userId: string, 
    checkpointId: string, 
    sessionId: string,
    source: string = 'auto_prompt'
  ): Promise<string> {
    const [request] = await db.insert(sessionRecoveryRequests).values({
      userId,
      checkpointId,
      sessionId,
      requestSource: source,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    }).returning();
    
    // Notify via WebSocket
    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'announcement',
      title: 'Session Recovery Available',
      description: 'We found unsaved work from your previous session. Would you like to recover it?',
      metadata: {
        recoveryRequestId: request.id,
        checkpointId,
        audience: 'user',
        targetUserId: userId,
      },
    }).catch((err) => log.warn('[sessionCheckpointService] Fire-and-forget failed:', err));
    
    return request.id;
  }
  
  /**
   * Accept and complete a recovery
   */
  async completeRecovery(
    requestId: string, 
    newSessionId: string,
    userFeedback?: string
  ): Promise<SessionCheckpoint | null> {
    const request = await db.query.sessionRecoveryRequests.findFirst({
      where: eq(sessionRecoveryRequests.id, requestId),
    });
    
    if (!request || request.status !== 'pending') {
      return null;
    }
    
    const checkpoint = await db.query.sessionCheckpoints.findFirst({
      where: eq(sessionCheckpoints.id, request.checkpointId),
    });
    
    if (!checkpoint) {
      return null;
    }
    
    // Update recovery request
    await db.update(sessionRecoveryRequests)
      .set({
        status: 'completed',
        newSessionId,
        respondedAt: new Date(),
        completedAt: new Date(),
        recoveredData: checkpoint.payload,
        userFeedback: userFeedback || 'helpful',
      })
      .where(eq(sessionRecoveryRequests.id, requestId));
    
    // Mark checkpoint as recovered
    await db.update(sessionCheckpoints)
      .set({
        isRecovered: true,
        updatedAt: new Date(),
      })
      .where(eq(sessionCheckpoints.id, checkpoint.id));
    
    // Log event
    await this.logEvent(checkpoint.id, 'recovered', 'user_initiated', {
      requestId,
      newSessionId,
    });
    
    this.notifyTrinity(checkpoint, 'checkpoint_recovered');
    
    log.info(`[SessionCheckpoint] Recovery completed for checkpoint ${checkpoint.id}`);
    return checkpoint;
  }
  
  /**
   * Log a checkpoint event
   */
  private async logEvent(
    checkpointId: string, 
    eventType: string, 
    eventSource: string,
    metadata: any
  ): Promise<void> {
    const entry = JSON.stringify([{ eventType, eventSource, metadata, createdAt: new Date().toISOString() }]);
    await db.update(sessionCheckpoints)
      .set({ checkpointEvents: sql`COALESCE(checkpoint_events, '[]'::jsonb) || ${entry}::jsonb` })
      .where(eq(sessionCheckpoints.id, checkpointId));
  }
  
  /**
   * Notify Trinity AI Brain about checkpoint changes
   */
  private notifyTrinity(checkpoint: SessionCheckpoint, action: string): void {
    try {
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'diagnostic',
        title: `Session Checkpoint: ${action}`,
        description: checkpoint.contextSummary || 'User session checkpoint updated',
        metadata: {
          checkpointId: checkpoint.id,
          userId: checkpoint.userId,
          phaseKey: checkpoint.phaseKey,
          pageRoute: checkpoint.pageRoute,
          action,
          trinityContextId: checkpoint.trinityContextId,
        },
        visibility: 'admin',
      }).catch((err) => log.warn('[sessionCheckpointService] Fire-and-forget failed:', err));
    } catch (error) {
      log.error('[SessionCheckpoint] Failed to notify Trinity:', error);
    }
  }
  
  /**
   * Cleanup expired checkpoints
   */
  async cleanupExpiredCheckpoints(): Promise<number> {
    const result = await db.delete(sessionCheckpoints)
      .where(
        and(
          lt(sessionCheckpoints.expiresAt, new Date()),
          eq(sessionCheckpoints.isFinal, true)
        )
      )
      .returning();
    
    log.info(`[SessionCheckpoint] Cleaned up ${result.length} expired checkpoints`);
    return result.length;
  }
}

export const sessionCheckpointService = SessionCheckpointService.getInstance();
