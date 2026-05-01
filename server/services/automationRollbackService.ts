import { db } from '../db';
import { auditLogs, employees, shifts, clients, invoices, schedules, timeEntries, payrollRuns } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { typedExec, typedQuery } from '../lib/typedSql';

export interface RollbackableAction {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actionDescription: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, any> } | null;
  userId: string;
  userEmail: string;
  createdAt: Date;
  canRollback: boolean;
  rollbackReason?: string;
}

export interface RollbackResult {
  success: boolean;
  auditLogId: string;
  entityType: string;
  entityId: string;
  restoredFields: string[];
  error?: string;
}

const ENTITY_TABLE_MAP: Record<string, PgTable> = {
  employee: employees,
  shift: shifts,
  client: clients,
  invoice: invoices,
  schedule: schedules,
  time_entry: timeEntries,
  payroll_run: payrollRuns,
};

const ALLOWED_FIELDS_PER_ENTITY: Record<string, Set<string>> = {
  employee: new Set(['firstName', 'first_name', 'lastName', 'last_name', 'email', 'phone', 'role', 'status', 'department', 'position', 'hireDate', 'hire_date', 'wage', 'hourlyRate', 'hourly_rate', 'address', 'city', 'state', 'zip', 'emergencyContact', 'emergency_contact', 'notes', 'isActive', 'is_active', 'workspaceRole', 'workspace_role', 'updatedAt', 'updated_at']),
  shift: new Set(['title', 'description', 'startTime', 'start_time', 'endTime', 'end_time', 'date', 'location', 'status', 'employeeId', 'employee_id', 'clientId', 'client_id', 'notes', 'breakMinutes', 'break_minutes', 'updatedAt', 'updated_at']),
  client: new Set(['name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'contactName', 'contact_name', 'status', 'notes', 'industry', 'updatedAt', 'updated_at']),
  invoice: new Set(['status', 'dueDate', 'due_date', 'amount', 'notes', 'description', 'updatedAt', 'updated_at']),
  schedule: new Set(['name', 'title', 'status', 'startDate', 'start_date', 'endDate', 'end_date', 'notes', 'updatedAt', 'updated_at']),
  time_entry: new Set(['clockIn', 'clock_in', 'clockOut', 'clock_out', 'status', 'notes', 'totalHours', 'total_hours', 'updatedAt', 'updated_at']),
  payroll_run: new Set(['status', 'periodStart', 'period_start', 'periodEnd', 'period_end', 'totalGrossPay', 'total_gross_pay', 'totalNetPay', 'total_net_pay', 'totalTaxes', 'total_taxes', 'notes', 'updatedAt', 'updated_at']),
};

const IMMUTABLE_FIELDS = new Set(['id', 'createdAt', 'created_at', 'workspaceId', 'workspace_id']);

const ROLLBACKABLE_ACTIONS = [
  'update',
  'employee_updated',
  'shift_updated',
  'schedule_updated',
  'client_updated',
  'invoice_updated',
  'workspace_updated',
  'role_changed',
  'status_changed',
  'approval',
  'rejection',
];

class AutomationRollbackService {
  async getRecentRollbackableActions(
    workspaceId: string,
    options: { limit?: number; entityType?: string; hoursBack?: number } = {}
  ): Promise<RollbackableAction[]> {
    const { limit = 50, entityType, hoursBack = 72 } = options;
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const conditions = [
      eq(auditLogs.workspaceId, workspaceId),
      sql`${auditLogs.createdAt} > ${cutoff}`,
      sql`${auditLogs.changes} IS NOT NULL`,
      sql`${auditLogs.changes}->>'before' IS NOT NULL`,
    ];

    if (entityType) {
      conditions.push(eq(auditLogs.entityType, entityType));
    }

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs.map((log) => {
      const changes = log.changes as { before?: Record<string, unknown>; after?: Record<string, any> } | null;
      const canRollback = this.canRollbackAction(log.entityType, log.action, changes);

      return {
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        actionDescription: log.actionDescription,
        changes,
        userId: log.userId,
        userEmail: log.userEmail,
        createdAt: log.createdAt,
        canRollback: canRollback.canRollback,
        rollbackReason: canRollback.reason,
      };
    });
  }

  private canRollbackAction(
    entityType: string | null,
    action: string,
    changes: { before?: Record<string, unknown>; after?: Record<string, any> } | null
  ): { canRollback: boolean; reason?: string } {
    if (!entityType) {
      return { canRollback: false, reason: 'No entity type recorded' };
    }

    if (!ENTITY_TABLE_MAP[entityType]) {
      return { canRollback: false, reason: `Entity type '${entityType}' is not supported for rollback` };
    }

    if (!ROLLBACKABLE_ACTIONS.includes(action)) {
      return { canRollback: false, reason: `Action '${action}' is not in the rollbackable actions list` };
    }

    if (!changes?.before || Object.keys(changes.before).length === 0) {
      return { canRollback: false, reason: 'No previous state recorded' };
    }

    return { canRollback: true };
  }

  private getSafeFields(entityType: string, beforeState: Record<string, unknown>): string[] {
    const allowedFields = ALLOWED_FIELDS_PER_ENTITY[entityType];
    if (!allowedFields) return [];

    return Object.keys(beforeState).filter(
      (key) => !IMMUTABLE_FIELDS.has(key) && allowedFields.has(key)
    );
  }

  async rollbackAction(
    auditLogId: string,
    workspaceId: string,
    performedBy: { userId: string; userEmail: string; userRole: string }
  ): Promise<RollbackResult> {
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.id, auditLogId), eq(auditLogs.workspaceId, workspaceId)))
      .limit(1);

    if (!log) {
      return { success: false, auditLogId, entityType: '', entityId: '', restoredFields: [], error: 'Audit log entry not found in this workspace' };
    }

    const changes = log.changes as { before?: Record<string, unknown>; after?: Record<string, any> } | null;
    const canRollback = this.canRollbackAction(log.entityType, log.action, changes);

    if (!canRollback.canRollback) {
      return {
        success: false,
        auditLogId,
        entityType: log.entityType || '',
        entityId: log.entityId || '',
        restoredFields: [],
        error: canRollback.reason || 'Action cannot be rolled back',
      };
    }

    const entityType = log.entityType!;
    const entityId = log.entityId;
    if (!entityId) {
      return {
        success: false,
        auditLogId,
        entityType,
        entityId: '',
        restoredFields: [],
        error: 'No entity ID recorded in audit log',
      };
    }

    const table = ENTITY_TABLE_MAP[entityType];
    if (!table) {
      return {
        success: false,
        auditLogId,
        entityType,
        entityId,
        restoredFields: [],
        error: `No table mapping for entity type '${entityType}'`,
      };
    }

    const beforeState = changes!.before!;
    const safeFields = this.getSafeFields(entityType, beforeState);

    if (safeFields.length === 0) {
      return {
        success: false,
        auditLogId,
        entityType,
        entityId,
        restoredFields: [],
        error: 'No restorable fields found in previous state (fields may not be whitelisted)',
      };
    }

    try {
      // CATEGORY C — Raw SQL retained: LIMIT | Tables:  | Verified: 2026-03-23
      const existingRows = await typedQuery(
        sql`SELECT id, workspace_id FROM ${table} WHERE id = ${entityId} LIMIT 1`
      );

      const existingRow = (existingRows as any).rows?.[0] || (existingRows as any)[0];
      if (!existingRow) {
        return {
          success: false,
          auditLogId,
          entityType,
          entityId,
          restoredFields: [],
          error: 'Target entity no longer exists in database',
        };
      }

      const rowWorkspaceId = existingRow.workspace_id || existingRow.workspaceId;
      if (!rowWorkspaceId) {
        return {
          success: false,
          auditLogId,
          entityType,
          entityId,
          restoredFields: [],
          error: 'Target entity has no workspace scope - rollback not permitted for security',
        };
      }
      if (rowWorkspaceId !== workspaceId) {
        return {
          success: false,
          auditLogId,
          entityType,
          entityId,
          restoredFields: [],
          error: 'Target entity does not belong to this workspace',
        };
      }

      const setClauses = safeFields.map((field) => {
        const value = beforeState[field];
        return sql`${sql.identifier(field)} = ${value}`;
      });

      const combinedSet = setClauses.reduce((acc, clause, i) =>
        i === 0 ? clause : sql`${acc}, ${clause}`
      );

      // CATEGORY C — Raw SQL retained: Dynamic SET clause construction | Tables: dynamic | Verified: 2026-03-23
      await typedExec(
        sql`UPDATE ${table} SET ${combinedSet} WHERE id = ${entityId}`
      );

      await db.insert(auditLogs).values({
        workspaceId,
        userId: performedBy.userId,
        userEmail: performedBy.userEmail,
        userRole: performedBy.userRole,
        action: 'update' as any,
        actionDescription: `Rollback of ${log.action} on ${entityType} ${entityId} (original action at ${log.createdAt.toISOString()})`,
        entityType,
        entityId,
        changes: {
          before: changes!.after,
          after: changes!.before,
        },
        metadata: {
          rollbackOfAuditLogId: auditLogId,
          originalAction: log.action,
          originalActorId: log.userId,
          originalActorEmail: log.userEmail,
          restoredFields: safeFields,
          success: true,
        },
      });

      return {
        success: true,
        auditLogId,
        entityType,
        entityId,
        restoredFields: safeFields,
      };
    } catch (error: any) {
      await db.insert(auditLogs).values({
        workspaceId,
        userId: performedBy.userId,
        userEmail: performedBy.userEmail,
        userRole: performedBy.userRole,
        action: 'update' as any,
        actionDescription: `Failed rollback attempt of ${log.action} on ${entityType} ${entityId}`,
        entityType,
        entityId,
        metadata: {
          rollbackOfAuditLogId: auditLogId,
          success: false,
          errorMessage: (error instanceof Error ? error.message : String(error)),
        },
      });

      return {
        success: false,
        auditLogId,
        entityType,
        entityId,
        restoredFields: [],
        error: `Rollback failed: ${error.message}`,
      };
    }
  }

  async batchRollback(
    auditLogIds: string[],
    workspaceId: string,
    performedBy: { userId: string; userEmail: string; userRole: string }
  ): Promise<RollbackResult[]> {
    const results: RollbackResult[] = [];
    for (const id of auditLogIds) {
      const result = await this.rollbackAction(id, workspaceId, performedBy);
      results.push(result);
    }
    return results;
  }
}

export const automationRollbackService = new AutomationRollbackService();
