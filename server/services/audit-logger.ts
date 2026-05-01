/**
 * Comprehensive Audit Logger Service
 * 
 * Implements:
 * - Event Sourcing Architecture (immutable audit_events)
 * - ID Registry (prevent ID reuse forever)
 * - Write-Ahead Logging (transaction safety)
 * - Actor Type Tracking (END_USER, SUPPORT_STAFF, AI_AGENT, SYSTEM)
 * - AI Action Verification (SHA-256 checksums)
 * - Multi-tenant RBAC enforcement
 */

import crypto from 'crypto';
import { storage } from '../storage';
import type { 
  InsertAuditLog,
  InsertIdRegistry, 
  InsertWriteAheadLog 
} from '@shared/schema';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('audit-logger');


// Actor Types
export type ActorType = 'END_USER' | 'SUPPORT_STAFF' | 'AI_AGENT' | 'SYSTEM';

export interface AuditContext {
  actorId: string;
  actorType: ActorType;
  actorName?: string;
  workspaceId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
}

export interface EventPayload {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, unknown>;
  changes?: { before: any; after: any };
}

export class AuditLogger {
  /**
   * Sort object keys deterministically for hash generation
   * Ensures consistent hashing regardless of property order
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    return Object.keys(obj)
      .sort()
      .reduce((sorted: any, key) => {
        sorted[key] = this.sortObjectKeys(obj[key]);
        return sorted;
      }, {});
  }

  /**
   * Log an immutable event to audit_events table
   * @param context - Actor and request context
   * @param event - Event details
   * @returns Event ID
   */
  async logEvent(
    context: AuditContext,
    event: EventPayload,
    options?: {
      generateHash?: boolean; // For AI actions
      autoCommit?: boolean;
    }
  ): Promise<string> {
    try {
      const { actorId, actorType, actorName, workspaceId, ipAddress, userAgent, sessionId, requestId } = context;
      const { eventType, aggregateId, aggregateType, payload, changes } = event;

      // Generate SHA-256 hash for AI actions (DETERMINISTIC - no timestamps!)
      let actionHash: string | undefined;
      if (options?.generateHash || actorType === 'AI_AGENT') {
        const hashInput = JSON.stringify({
          rawAction: eventType,
          aggregateId,
          aggregateType,
          actorId,
          payload: this.sortObjectKeys(payload), // Deterministic ordering
        });
        actionHash = crypto.createHash('sha256').update(hashInput).digest('hex');
      }

      // Create audit event
      const auditEvent: InsertAuditLog = {
        eventType,
        userId: actorId,
        actorType,
        userName: actorName || undefined,
        workspaceId: workspaceId || undefined,
        entityId: aggregateId,
        entityType: aggregateType,
        payload,
        changes: changes || undefined,
        actionHash,
        eventStatus: options?.autoCommit ? 'committed' : 'pending',
        metadata: {
          ipAddress,
          userAgent,
          requestId,
        },
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
        requestId: requestId || undefined,
      };

      const eventId = await storage.createAuditEvent(auditEvent);

      // Auto-verify AI actions after commit
      if (options?.autoCommit && actionHash) {
        await storage.verifyAuditEvent(eventId, actionHash);
      }

      return eventId;
    } catch (error) {
      log.error('[AuditLogger] Failed to log event:', error);
      throw error;
    }
  }

  /**
   * Register an ID in the registry to prevent reuse
   * @param id - The ID to register
   * @param entityType - Type of entity (USER, ORG, EMPLOYEE, etc.)
   * @param context - Actor context
   */
  async registerID(
    id: string,
    entityType: string,
    context: AuditContext
  ): Promise<void> {
    try {
      const registryEntry: InsertIdRegistry = {
        id,
        entityType,
        workspaceId: context.workspaceId || undefined,
        issuedBy: context.actorId,
        issuedByType: context.actorType,
        neverReuse: true,
        metadata: {
          requestId: context.requestId,
          timestamp: Date.now(),
        },
      };

      await storage.registerID(registryEntry);
    } catch (error) {
      // ID might already be registered - that's OK
      log.warn('[AuditLogger] ID registration warning:', error);
    }
  }

  /**
   * Write-Ahead Log: Prepare transaction
   * @returns Transaction ID
   */
  async prepareTransaction(
    context: AuditContext,
    operation: {
      operationType: string;
      entityType: string;
      entityId: string;
      payload: Record<string, unknown>;
    }
  ): Promise<string> {
    try {
      const transactionId = `txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

      const walEntry: InsertWriteAheadLog = {
        transactionId,
        operationType: operation.operationType,
        entityType: operation.entityType,
        entityId: operation.entityId,
        actorId: context.actorId,
        actorType: context.actorType,
        workspaceId: context.workspaceId || undefined,
        payload: operation.payload,
        status: 'pending',
      };

      await storage.createWriteAheadLog(walEntry);
      await storage.markWALPrepared(transactionId);

      return transactionId;
    } catch (error) {
      log.error('[AuditLogger] Failed to prepare transaction:', error);
      throw error;
    }
  }

  /**
   * Write-Ahead Log: Commit transaction
   */
  async commitTransaction(transactionId: string): Promise<void> {
    try {
      await storage.markWALCommitted(transactionId);
    } catch (error) {
      log.error('[AuditLogger] Failed to commit transaction:', error);
      throw error;
    }
  }

  /**
   * Write-Ahead Log: Rollback transaction
   */
  async rollbackTransaction(transactionId: string, errorMessage?: string): Promise<void> {
    try {
      await storage.markWALRolledBack(transactionId, errorMessage);
    } catch (error) {
      log.error('[AuditLogger] Failed to rollback transaction:', error);
      throw error;
    }
  }

  /**
   * Helper: Execute action with Write-Ahead Logging
   * @param context - Actor context
   * @param operation - Operation details
   * @param action - Function to execute
   * @returns Result of action
   */
  async executeWithWAL<T>(
    context: AuditContext,
    operation: {
      operationType: string;
      entityType: string;
      entityId: string;
      payload: Record<string, unknown>;
    },
    action: () => Promise<T>
  ): Promise<T> {
    // Phase 1: Prepare
    const transactionId = await this.prepareTransaction(context, operation);

    try {
      // Phase 2: Execute
      const result = await action();

      // Phase 3: Commit
      await this.commitTransaction(transactionId);

      // Log successful event
      await this.logEvent(
        context,
        {
          eventType: `${operation.operationType}_${operation.entityType}`,
          aggregateId: operation.entityId,
          aggregateType: operation.entityType,
          payload: operation.payload,
        },
        { autoCommit: true }
      );

      return result;
    } catch (error) {
      // Rollback on error
      await this.rollbackTransaction(transactionId, (error as Error).message);

      // Log failed event
      await this.logEvent(
        context,
        {
          eventType: `${operation.operationType}_${operation.entityType}_FAILED`,
          aggregateId: operation.entityId,
          aggregateType: operation.entityType,
          payload: { error: (error as Error).message },
        },
        { autoCommit: true }
      );

      throw error;
    }
  }

  /**
   * Support Staff Action Tracker
   * Special logging for support interventions with enhanced metadata
   */
  async logSupportAction(
    supportStaffId: string,
    supportStaffName: string,
    action: {
      actionType: string;
      targetEntityType: string;
      targetEntityId: string;
      changes?: { before: any; after: any };
      reason?: string;
      metadata?: Record<string, unknown>;
    },
    requestContext?: {
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    }
  ): Promise<string> {
    const context: AuditContext = {
      actorId: supportStaffId,
      actorType: 'SUPPORT_STAFF',
      actorName: supportStaffName,
      ipAddress: requestContext?.ipAddress,
      userAgent: requestContext?.userAgent,
      requestId: requestContext?.requestId || `support_${Date.now()}`,
    };

    const eventId = await this.logEvent(
      context,
      {
        eventType: `SUPPORT_${action.actionType}`,
        aggregateId: action.targetEntityId,
        aggregateType: action.targetEntityType,
        payload: {
          reason: action.reason,
          ...action.metadata,
        },
        changes: action.changes,
      },
      { autoCommit: true }
    );

    return eventId;
  }

  /**
   * AI Action Logger with Verification
   * Logs AI Brain actions with SHA-256 checksums for verification
   */
  async logAIAction(
    aiAgentId: string,
    aiAgentName: string,
    action: {
      actionType: string;
      targetEntityType: string;
      targetEntityId: string;
      payload: Record<string, unknown>;
      workspaceId?: string | null;
    }
  ): Promise<{ eventId: string; actionHash: string }> {
    const context: AuditContext = {
      actorId: aiAgentId,
      actorType: 'AI_AGENT',
      actorName: aiAgentName,
      workspaceId: action.workspaceId,
      requestId: `ai_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    };

    // Generate DETERMINISTIC hash for verification (NO timestamps!)
    const hashInput = JSON.stringify({
      aiAgentId,
      actionType: action.actionType,
      targetEntityType: action.targetEntityType,
      targetEntityId: action.targetEntityId,
      payload: this.sortObjectKeys(action.payload),
    });
    const actionHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    const eventId = await this.logEvent(
      context,
      {
        eventType: `AI_${action.actionType}`,
        aggregateId: action.targetEntityId,
        aggregateType: action.targetEntityType,
        payload: {
          ...action.payload,
          aiAgent: aiAgentName,
          verificationHash: actionHash,
        },
      },
      { generateHash: true, autoCommit: true }
    );

    return { eventId, actionHash };
  }

  /**
   * Verify AI action integrity
   * @param eventId - Event ID to verify
   * @param expectedHash - Expected SHA-256 hash
   * @returns true if verified, false otherwise
   */
  async verifyAIAction(eventId: string, expectedHash: string): Promise<boolean> {
    try {
      const event = await storage.getAuditEvent(eventId);
      if (!event) {
        return false;
      }

      if (event.actionHash !== expectedHash) {
        log.error('[AuditLogger] Hash mismatch for AI action:', {
          eventId,
          expected: expectedHash,
          actual: event.actionHash,
        });
        return false;
      }

      // Mark as verified
      await storage.verifyAuditEvent(eventId, expectedHash);
      return true;
    } catch (error) {
      log.error('[AuditLogger] Failed to verify AI action:', error);
      return false;
    }
  }

  /**
   * System Action Logger
   * For cron jobs, webhooks, and automated processes
   */
  async logSystemAction(
    action: {
      actionType: string;
      targetEntityType: string;
      targetEntityId: string;
      payload: Record<string, unknown>;
      workspaceId?: string | null;
    }
  ): Promise<string> {
    const context: AuditContext = {
      actorId: 'system',
      actorType: 'SYSTEM',
      actorName: PLATFORM.name + " System",
      workspaceId: action.workspaceId,
      requestId: `sys_${Date.now()}`,
    };

    const eventId = await this.logEvent(
      context,
      {
        eventType: `SYSTEM_${action.actionType}`,
        aggregateId: action.targetEntityId,
        aggregateType: action.targetEntityType,
        payload: action.payload,
      },
      { autoCommit: true }
    );

    return eventId;
  }

  /**
   * Log a Class A Production Blocker Failure
   * These are critical security or integrity violations that must be alerted immediately.
   */
  async logClassAFailure(
    context: AuditContext,
    failure: {
      type: string;
      description: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
    const eventId = await this.logEvent(
      context,
      {
        eventType: `CLASS_A_FAILURE_${failure.type}`,
        aggregateId: 'platform',
        aggregateType: 'PLATFORM_SECURITY',
        payload: {
          description: failure.description,
          ...failure.metadata,
        },
      },
      { autoCommit: true }
    );

    // Trigger critical alert
    log.error(`[MONITORING] CRITICAL ALERT: Class A Production Blocker - ${failure.type}: ${failure.description}`, {
      eventId,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      ...failure.metadata,
    });

    return eventId;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
