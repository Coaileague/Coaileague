import crypto from 'crypto';

/**
 * Deletion Protection Service
 * 
 * Fortune 500-grade protection against accidental data loss during:
 * - Data migrations
 * - QuickBooks/HRIS syncs
 * - User/admin actions
 * - System cleanup jobs
 * 
 * Key Principles:
 * 1. SOFT DELETE by default - Never hard delete billing-related data
 * 2. BILLING CHECKS - Block deletion of entities with active invoices/payments
 * 3. CASCADE PROTECTION - Verify all dependent entities before proceeding
 * 4. MULTI-STEP APPROVAL - Critical deletions require confirmation
 * 5. AUDIT TRAIL - Log every deletion attempt and outcome
 * 6. RECOVERY WINDOW - 30-day recovery period for soft-deleted data
 */

import { db } from "../db";
import { 
  users, workspaces, employees, clients, invoices, 
  shifts, timeEntries, notifications
} from "@shared/schema";
import { eq, and, or, gt, sql, isNull, inArray } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('deletionProtectionService');


// Protection levels for different entity types
export type ProtectionLevel = 'critical' | 'high' | 'medium' | 'low';

// Deletion modes
export type DeletionMode = 'soft' | 'hard' | 'archive';

// Result of a deletion check
export interface DeletionCheckResult {
  allowed: boolean;
  reason?: string;
  blockingEntities?: {
    type: string;
    count: number;
    examples?: string[];
  }[];
  requiresConfirmation?: boolean;
  confirmationCode?: string;
  warningLevel?: 'info' | 'warning' | 'critical';
}

// Deletion request
export interface DeletionRequest {
  entityType: 'user' | 'workspace' | 'employee' | 'client' | 'invoice' | 'shift';
  entityId: string;
  requestedBy: string;
  reason: string;
  mode?: DeletionMode;
  confirmationCode?: string;
  bypassChecks?: boolean; // Only for platform admins with elevated session
  isMigration?: boolean;
  isSync?: boolean;
}

// Deletion audit record
export interface DeletionAuditRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: 'soft_delete' | 'hard_delete' | 'archive' | 'blocked' | 'recovered';
  requestedBy: string;
  reason: string;
  blockedReason?: string;
  dependentEntities?: object;
  timestamp: Date;
  isMigration: boolean;
  isSync: boolean;
  recoveryDeadline?: Date;
}

// Protection configuration per entity type
const PROTECTION_CONFIG: Record<string, {
  level: ProtectionLevel;
  defaultMode: DeletionMode;
  requiresConfirmation: boolean;
  checkBilling: boolean;
  cascadeWarning: boolean;
  recoveryDays: number;
}> = {
  user: {
    level: 'critical',
    defaultMode: 'soft',
    requiresConfirmation: true,
    checkBilling: true,
    cascadeWarning: true,
    recoveryDays: 90,
  },
  workspace: {
    level: 'critical',
    defaultMode: 'soft',
    requiresConfirmation: true,
    checkBilling: true,
    cascadeWarning: true,
    recoveryDays: 90,
  },
  employee: {
    level: 'high',
    defaultMode: 'soft',
    requiresConfirmation: true,
    checkBilling: true,
    cascadeWarning: true,
    recoveryDays: 60,
  },
  client: {
    level: 'high',
    defaultMode: 'soft',
    requiresConfirmation: true,
    checkBilling: true,
    cascadeWarning: true,
    recoveryDays: 60,
  },
  invoice: {
    level: 'high',
    defaultMode: 'archive',
    requiresConfirmation: true,
    checkBilling: true,
    cascadeWarning: false,
    recoveryDays: 365 * 7, // 7-year SOX compliance
  },
  shift: {
    level: 'medium',
    defaultMode: 'soft',
    requiresConfirmation: false,
    checkBilling: true,
    cascadeWarning: true,
    recoveryDays: 30,
  },
};

class DeletionProtectionService {
  private auditLog: DeletionAuditRecord[] = [];
  private pendingConfirmations: Map<string, { request: DeletionRequest; expires: Date }> = new Map();

  /**
   * Generate a confirmation code for critical deletions
   */
  private generateConfirmationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars like 0/O, 1/I
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(bytes[i] % chars.length);
    }
    return code;
  }

  /**
   * Check if an entity can be safely deleted
   */
  async checkDeletion(request: DeletionRequest): Promise<DeletionCheckResult> {
    const config = PROTECTION_CONFIG[request.entityType];
    if (!config) {
      return { allowed: false, reason: `Unknown entity type: ${request.entityType}` };
    }

    const blockingEntities: DeletionCheckResult['blockingEntities'] = [];

    // Check for active billing
    if (config.checkBilling) {
      const billingBlocks = await this.checkActiveBilling(request.entityType, request.entityId);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (billingBlocks.length > 0) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        blockingEntities.push(...billingBlocks);
      }
    }

    // Check for cascade dependencies
    if (config.cascadeWarning) {
      const cascadeDeps = await this.checkCascadeDependencies(request.entityType, request.entityId);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (cascadeDeps.length > 0) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        blockingEntities.push(...cascadeDeps);
      }
    }

    // If there are blocking entities with active billing, block deletion
    const hasBillingBlock = blockingEntities.some(b => 
      b.type.includes('invoice') || b.type.includes('payment') || b.type.includes('subscription')
    );

    if (hasBillingBlock && !request.bypassChecks) {
      return {
        allowed: false,
        reason: 'Cannot delete entity with active billing. Please resolve outstanding invoices/payments first.',
        blockingEntities,
        warningLevel: 'critical',
      };
    }

    // For critical entities, require confirmation
    if (config.requiresConfirmation && !request.confirmationCode) {
      const code = this.generateConfirmationCode();
      this.pendingConfirmations.set(code, {
        request,
        expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minute expiry
      });

      return {
        allowed: false,
        reason: `Deletion requires confirmation. Use code: ${code}`,
        blockingEntities: blockingEntities.length > 0 ? blockingEntities : undefined,
        requiresConfirmation: true,
        confirmationCode: code,
        warningLevel: blockingEntities.length > 0 ? 'warning' : 'info',
      };
    }

    // Verify confirmation code if provided
    if (request.confirmationCode) {
      const pending = this.pendingConfirmations.get(request.confirmationCode);
      if (!pending || pending.expires < new Date()) {
        return {
          allowed: false,
          reason: 'Invalid or expired confirmation code',
          warningLevel: 'warning',
        };
      }
      this.pendingConfirmations.delete(request.confirmationCode);
    }

    return {
      allowed: true,
      blockingEntities: blockingEntities.length > 0 ? blockingEntities : undefined,
      warningLevel: blockingEntities.length > 0 ? 'warning' : 'info',
    };
  }

  /**
   * Check for active billing that would block deletion
   */
  private async checkActiveBilling(entityType: string, entityId: string): Promise<DeletionCheckResult['blockingEntities']> {
    const blocks: DeletionCheckResult['blockingEntities'] = [];

    try {
      if (entityType === 'workspace') {
        // Check for unpaid invoices
        const unpaidInvoices = await db.select({ count: sql<number>`count(*)` })
          .from(invoices)
          .where(and(
            eq(invoices.workspaceId, entityId),
            or(
              eq(invoices.status, 'pending'),
              eq(invoices.status, 'sent'),
              eq(invoices.status, 'overdue')
            )
          ));
        
        if (unpaidInvoices[0]?.count > 0) {
          blocks.push({
            type: 'unpaid_invoices',
            count: unpaidInvoices[0].count,
          });
        }
      }

      if (entityType === 'employee') {
        // Check for pending timesheet entries
        const pendingTimesheets = await db.select({ count: sql<number>`count(*)` })
          .from(timeEntries)
          .where(and(
            eq(timeEntries.employeeId, entityId),
            // @ts-expect-error — TS migration: fix in refactoring sprint
            eq(timeEntries.approvalStatus, 'pending')
          ));
        
        if (pendingTimesheets[0]?.count > 0) {
          blocks.push({
            type: 'pending_timesheets',
            count: pendingTimesheets[0].count,
          });
        }

        // Check for future shifts
        const futureShifts = await db.select({ count: sql<number>`count(*)` })
          .from(shifts)
          .where(and(
            eq(shifts.employeeId, entityId),
            gt(shifts.startTime, new Date())
          ));
        
        if (futureShifts[0]?.count > 0) {
          blocks.push({
            type: 'future_shifts',
            count: futureShifts[0].count,
          });
        }
      }

      if (entityType === 'client') {
        // Check for unpaid invoices
        const clientInvoices = await db.select({ count: sql<number>`count(*)` })
          .from(invoices)
          .where(and(
            eq(invoices.clientId, entityId),
            or(
              eq(invoices.status, 'pending'),
              eq(invoices.status, 'sent'),
              eq(invoices.status, 'overdue')
            )
          ));
        
        if (clientInvoices[0]?.count > 0) {
          blocks.push({
            type: 'unpaid_client_invoices',
            count: clientInvoices[0].count,
          });
        }
      }
    } catch (error) {
      log.error('[DeletionProtection] Error checking billing:', error);
    }

    return blocks;
  }

  /**
   * Check for cascade dependencies that would be affected
   */
  private async checkCascadeDependencies(entityType: string, entityId: string): Promise<DeletionCheckResult['blockingEntities']> {
    const deps: DeletionCheckResult['blockingEntities'] = [];

    try {
      if (entityType === 'workspace') {
        // Count employees
        const empCount = await db.select({ count: sql<number>`count(*)` })
          .from(employees)
          .where(eq(employees.workspaceId, entityId));
        if (empCount[0]?.count > 0) {
          deps.push({ type: 'employees', count: empCount[0].count });
        }

        // Count clients
        const clientCount = await db.select({ count: sql<number>`count(*)` })
          .from(clients)
          .where(eq(clients.workspaceId, entityId));
        if (clientCount[0]?.count > 0) {
          deps.push({ type: 'clients', count: clientCount[0].count });
        }

        // Count shifts
        const shiftCount = await db.select({ count: sql<number>`count(*)` })
          .from(shifts)
          .where(eq(shifts.workspaceId, entityId));
        if (shiftCount[0]?.count > 0) {
          deps.push({ type: 'shifts', count: shiftCount[0].count });
        }

        // Count invoices
        const invoiceCount = await db.select({ count: sql<number>`count(*)` })
          .from(invoices)
          .where(eq(invoices.workspaceId, entityId));
        if (invoiceCount[0]?.count > 0) {
          deps.push({ type: 'invoices', count: invoiceCount[0].count });
        }
      }

      if (entityType === 'user') {
        // User deletion cascade check - users own workspaces
        const ownedWorkspaces = await db.select({ count: sql<number>`count(*)` })
          .from(workspaces)
          .where(eq(workspaces.ownerId, entityId));
        if (ownedWorkspaces[0]?.count > 0) {
          deps.push({ type: 'owned_workspaces', count: ownedWorkspaces[0].count });
        }
      }

      if (entityType === 'employee') {
        // Count shifts
        const shiftCount = await db.select({ count: sql<number>`count(*)` })
          .from(shifts)
          .where(eq(shifts.employeeId, entityId));
        if (shiftCount[0]?.count > 0) {
          deps.push({ type: 'shifts', count: shiftCount[0].count });
        }

        // Count timesheets
        const timesheetCount = await db.select({ count: sql<number>`count(*)` })
          .from(timeEntries)
          .where(eq(timeEntries.employeeId, entityId));
        if (timesheetCount[0]?.count > 0) {
          deps.push({ type: 'timesheet_entries', count: timesheetCount[0].count });
        }
      }
    } catch (error) {
      log.error('[DeletionProtection] Error checking dependencies:', error);
    }

    return deps;
  }

  /**
   * Perform a safe deletion (soft delete by default)
   */
  async safeDelete(request: DeletionRequest): Promise<{
    success: boolean;
    mode: DeletionMode;
    auditId: string;
    recoveryDeadline?: Date;
    error?: string;
  }> {
    // First check if deletion is allowed
    const check = await this.checkDeletion(request);
    if (!check.allowed) {
      // Log the blocked attempt
      const auditId = this.logAudit({
        entityType: request.entityType,
        entityId: request.entityId,
        action: 'blocked',
        requestedBy: request.requestedBy,
        reason: request.reason,
        blockedReason: check.reason,
        dependentEntities: check.blockingEntities,
        isMigration: request.isMigration || false,
        isSync: request.isSync || false,
      });

      return {
        success: false,
        mode: 'soft',
        auditId,
        error: check.reason,
      };
    }

    const config = PROTECTION_CONFIG[request.entityType];
    const mode = request.mode || config.defaultMode;
    const recoveryDeadline = new Date(Date.now() + config.recoveryDays * 24 * 60 * 60 * 1000);

    try {
      // Perform the deletion based on mode
      if (mode === 'soft' || mode === 'archive') {
        await this.performSoftDelete(request.entityType, request.entityId);
      } else if (mode === 'hard' && request.bypassChecks) {
        // Hard delete only allowed with bypass (platform admin)
        await this.performHardDelete(request.entityType, request.entityId);
      } else {
        // Default to soft delete for safety
        await this.performSoftDelete(request.entityType, request.entityId);
      }

      // Log successful deletion
      const auditId = this.logAudit({
        entityType: request.entityType,
        entityId: request.entityId,
        action: mode === 'hard' ? 'hard_delete' : mode === 'archive' ? 'archive' : 'soft_delete',
        requestedBy: request.requestedBy,
        reason: request.reason,
        dependentEntities: check.blockingEntities,
        isMigration: request.isMigration || false,
        isSync: request.isSync || false,
        recoveryDeadline: mode !== 'hard' ? recoveryDeadline : undefined,
      });

      log.info(`[DeletionProtection] ${mode} delete completed for ${request.entityType}:${request.entityId} by ${request.requestedBy}`);

      return {
        success: true,
        mode,
        auditId,
        recoveryDeadline: mode !== 'hard' ? recoveryDeadline : undefined,
      };
    } catch (error) {
      log.error(`[DeletionProtection] Delete failed for ${request.entityType}:${request.entityId}:`, error);
      
      const auditId = this.logAudit({
        entityType: request.entityType,
        entityId: request.entityId,
        action: 'blocked',
        requestedBy: request.requestedBy,
        reason: request.reason,
        blockedReason: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isMigration: request.isMigration || false,
        isSync: request.isSync || false,
      });

      return {
        success: false,
        mode,
        auditId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Perform soft delete by setting deletedAt timestamp
   */
  private async performSoftDelete(entityType: string, entityId: string): Promise<void> {
    const now = new Date();

    switch (entityType) {
      case 'user':
        // Soft delete user by locking account far into the future (users table doesn't have isActive)
        await db.update(users)
          .set({ 
            lockedUntil: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
            firstName: sql`CONCAT('[DELETED] ', ${users.firstName})`,
          })
          .where(eq(users.id, entityId));
        break;

      case 'employee':
        await db.update(employees)
          .set({ 
            isActive: false,
            terminationDate: now,
          })
          .where(eq(employees.id, entityId));
        break;

      case 'client':
        await db.update(clients)
          .set({ isActive: false })
          .where(eq(clients.id, entityId));
        break;

      case 'workspace':
        // Soft delete workspace by marking as suspended
        await db.update(workspaces)
          .set({ isSuspended: true })
          .where(eq(workspaces.id, entityId));
        break;

      case 'invoice':
        // Archive invoices, never delete
        await db.update(invoices)
          .set({ status: 'void' })
          .where(eq(invoices.id, entityId));
        break;

      case 'shift':
        await db.update(shifts)
          .set({ status: 'cancelled' })
          .where(eq(shifts.id, entityId));
        break;

      case 'timeEntry':
      case 'time_entry':
        // Soft-delete by marking as voided — preserves audit trail
        await db.update(timeEntries)
          .set({ status: 'voided' } as any)
          .where(eq(timeEntries.id, entityId));
        break;

      case 'notification':
        // Soft-delete notifications by clearing them permanently
        await db.update(notifications)
          .set({ clearedAt: new Date() })
          .where(eq(notifications.id, entityId));
        break;

      default:
        // Unknown entity type — log warning instead of crashing; data is left untouched
        log.warn(`[DeletionProtection] Soft delete not configured for entity type "${entityType}" (id: ${entityId}) — no action taken`);
        break;
    }
  }

  /**
   * Perform hard delete (only for platform admins with bypass)
   */
  private async performHardDelete(entityType: string, entityId: string): Promise<void> {
    // This is a dangerous operation - only allowed with explicit bypass
    log.warn(`[DeletionProtection] HARD DELETE performed on ${entityType}:${entityId}`);

    switch (entityType) {
      case 'user':
        await db.delete(users).where(eq(users.id, entityId));
        break;
      case 'employee':
        await db.delete(employees).where(eq(employees.id, entityId));
        break;
      case 'client':
        await db.delete(clients).where(eq(clients.id, entityId));
        break;
      case 'shift':
        await db.delete(shifts).where(eq(shifts.id, entityId));
        break;
      default:
        throw new Error(`Hard delete not allowed for ${entityType}`);
    }
  }

  /**
   * Recover a soft-deleted entity
   */
  async recover(entityType: string, entityId: string, requestedBy: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      switch (entityType) {
        case 'user':
          await db.update(users)
            .set({ 
              lockedUntil: null,
              firstName: sql`REPLACE(${users.firstName}, '[DELETED] ', '')`,
            })
            .where(eq(users.id, entityId));
          break;

        case 'employee':
          await db.update(employees)
            .set({ 
              isActive: true,
              terminationDate: null,
            })
            .where(eq(employees.id, entityId));
          break;

        case 'client':
          await db.update(clients)
            .set({ isActive: true })
            .where(eq(clients.id, entityId));
          break;

        case 'workspace':
          await db.update(workspaces)
            .set({ isSuspended: false })
            .where(eq(workspaces.id, entityId));
          break;

        default:
          return { success: false, error: `Recovery not supported for ${entityType}` };
      }

      this.logAudit({
        entityType,
        entityId,
        action: 'recovered',
        requestedBy,
        reason: 'Entity recovery requested',
        isMigration: false,
        isSync: false,
      });

      log.info(`[DeletionProtection] Recovered ${entityType}:${entityId} by ${requestedBy}`);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Log deletion audit record
   */
  private logAudit(record: Omit<DeletionAuditRecord, 'id' | 'timestamp'>): string {
    const id = `del-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const fullRecord: DeletionAuditRecord = {
      ...record,
      id,
      timestamp: new Date(),
    };

    this.auditLog.push(fullRecord);

    // Keep only last 10000 records in memory
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    // Log to console for server logs
    log.info(`[DeletionAudit] ${record.action}: ${record.entityType}:${record.entityId} by ${record.requestedBy}${record.blockedReason ? ` (blocked: ${record.blockedReason})` : ''}`);

    return id;
  }

  /**
   * Get recent deletion audit records
   */
  getAuditLog(limit: number = 100): DeletionAuditRecord[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Check if entity can be safely deleted during migration/sync
   */
  async checkMigrationSafety(entityType: string, entityIds: string[]): Promise<{
    safe: string[];
    blocked: { id: string; reason: string }[];
  }> {
    const safe: string[] = [];
    const blocked: { id: string; reason: string }[] = [];

    for (const entityId of entityIds) {
      const check = await this.checkDeletion({
        entityType: entityType as DeletionRequest['entityType'],
        entityId,
        requestedBy: 'system:migration',
        reason: 'Migration safety check',
        isMigration: true,
      });

      if (check.allowed || (!check.blockingEntities?.some(b => b.type.includes('invoice')))) {
        safe.push(entityId);
      } else {
        blocked.push({ 
          id: entityId, 
          reason: check.reason || 'Has active billing data' 
        });
      }
    }

    return { safe, blocked };
  }
}

// Export singleton instance
export const deletionProtection = new DeletionProtectionService();

// Export helper functions for common operations
export async function safeDeleteUser(userId: string, requestedBy: string, reason: string) {
  return deletionProtection.safeDelete({
    entityType: 'user',
    entityId: userId,
    requestedBy,
    reason,
  });
}

export async function safeDeleteEmployee(employeeId: string, requestedBy: string, reason: string) {
  return deletionProtection.safeDelete({
    entityType: 'employee',
    entityId: employeeId,
    requestedBy,
    reason,
  });
}

export async function safeDeleteClient(clientId: string, requestedBy: string, reason: string) {
  return deletionProtection.safeDelete({
    entityType: 'client',
    entityId: clientId,
    requestedBy,
    reason,
  });
}

export async function safeDeleteWorkspace(workspaceId: string, requestedBy: string, reason: string) {
  return deletionProtection.safeDelete({
    entityType: 'workspace',
    entityId: workspaceId,
    requestedBy,
    reason,
  });
}

export async function checkMigrationSafety(entityType: string, entityIds: string[]) {
  return deletionProtection.checkMigrationSafety(entityType, entityIds);
}
