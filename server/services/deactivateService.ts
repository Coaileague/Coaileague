/**
 * Deactivate / Reactivate Service
 * =================================
 * Unified access control terminology:
 *   DEACTIVATE = Remove access immediately (soft delete, data preserved)
 *   REACTIVATE = Restore access (data intact, user can log in again)
 *
 * Handles: employees, clients, workspaces
 * On deactivate: invalidates sessions, emits WebSocket, logs audit
 * On reactivate: restores access, emits WebSocket, logs audit
 */

import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { employees, clients, workspaces, sessions, auditLogs, authTokens } from '@shared/schema';
// @ts-expect-error — TS migration: fix in refactoring sprint
import type { Server as IOServer } from 'socket.io';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('deactivateService');


let io: IOServer | null = null;

export function initDeactivateService(socketServer: IOServer) {
  io = socketServer;
}

function emitToWorkspace(workspaceId: string, event: string, payload: object) {
  if (io) {
    io.to(`workspace:${workspaceId}`).emit(event, payload);
  }
}

function emitToUser(userId: string, event: string, payload: object) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

async function writeAuditLog(params: {
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: object;
}) {
  try {
    await db.insert(auditLogs).values({
      workspaceId: params.workspaceId,
      userId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changes: params.changes,
      ipAddress: 'server',
      userAgent: 'DeactivateService',
      createdAt: new Date(),
    });
  } catch {
    // Audit log failures must not block the main operation
  }
}

// ============================================================================
// EMPLOYEE DEACTIVATE / REACTIVATE
// ============================================================================

export async function deactivateEmployee(
  employeeId: string,
  actorId: string,
  reason?: string
) {
  const [emp] = await db
    .update(employees)
    .set({
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedBy: actorId,
      deactivationReason: reason ?? null,
    })
    .where(eq(employees.id, employeeId))
    .returning();

  if (!emp) throw new Error('Employee not found');

  // FIX [TOKEN LIFECYCLE ON TERMINATION]: Invalidate all active sessions AND all
  // outstanding password-reset / invite tokens for the terminated user. Without
  // this, a terminated employee could use a pre-issued reset-link to regain access
  // to their account after their employee record has been deactivated.
  if (emp.userId) {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.delete(sessions).where(eq(sessions.userId, emp.userId));
    await db.delete(authTokens).where(eq(authTokens.userId, emp.userId));
    emitToUser(emp.userId, 'session:terminated', {
      reason: 'Account deactivated',
      message: 'Your account has been deactivated. Please contact your manager.',
    });
  }

  // Notify workspace via WebSocket
  emitToWorkspace(emp.workspaceId, 'employee:deactivated', {
    employeeId: emp.id,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    deactivatedBy: actorId,
    reason: reason,
    timestamp: new Date().toISOString(),
  });

  // Emit platform event so Trinity can react (unassign future shifts, coverage pipeline)
  platformEventBus.publish({
    type: 'employee_terminated',
    workspaceId: emp.workspaceId,
    payload: {
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      deactivatedBy: actorId,
      reason: reason ?? 'No reason provided',
    },
    metadata: { source: 'deactivateService', actorId },
  }).catch((err) => log.warn('[deactivateService] Fire-and-forget failed:', err));

  // Unassign the officer from all future shifts and trigger coverage pipeline
  try {
    const { handleOfficerDeactivation } = await import('./scheduling/officerDeactivationHandler');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await handleOfficerDeactivation(emp.id, emp.workspaceId, 'terminated');
  } catch (err) {
    log.error('[DeactivateService] Failed to unassign future shifts for terminated employee:', err);
  }

  await writeAuditLog({
    workspaceId: emp.workspaceId,
    actorId,
    action: 'deactivate',
    entityType: 'employee',
    entityId: employeeId,
    changes: { isActive: false, deactivationReason: reason, deactivatedAt: new Date() },
  });

  return emp;
}

export async function reactivateEmployee(
  employeeId: string,
  actorId: string
) {
  // Check months inactive to determine if full re-onboarding is required (3-month rule)
  const [current] = await db
    .select({ deactivatedAt: employees.deactivatedAt })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const now = new Date();
  const monthsInactive = current?.deactivatedAt
    ? (now.getTime() - current.deactivatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : 0;
  const requiresFullReonboarding = monthsInactive >= 3;

  const [emp] = await db
    .update(employees)
    .set({
      isActive: true,
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
      reactivatedAt: now,
      reactivatedBy: actorId,
      requiresFullReonboarding,
    })
    .where(eq(employees.id, employeeId))
    .returning();

  if (!emp) throw new Error('Employee not found');

  emitToWorkspace(emp.workspaceId, 'employee:reactivated', {
    employeeId: emp.id,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    reactivatedBy: actorId,
    timestamp: new Date().toISOString(),
  });

  await writeAuditLog({
    workspaceId: emp.workspaceId,
    actorId,
    action: 'reactivate',
    entityType: 'employee',
    entityId: employeeId,
    changes: {
      isActive: true,
      deactivatedAt: null,
      reactivatedAt: now.toISOString(),
      requiresFullReonboarding,
      monthsInactive: Math.round(monthsInactive * 10) / 10,
    },
  });

  return { ...emp, requiresFullReonboarding, monthsInactive: Math.round(monthsInactive * 10) / 10 };
}

// ============================================================================
// CLIENT DEACTIVATE / REACTIVATE
// ============================================================================

export async function deactivateClient(
  clientId: string,
  actorId: string,
  workspaceId: string,
  reason?: string
) {
  const [client] = await db
    .update(clients)
    .set({
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedBy: actorId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      deactivationReason: reason ?? null,
    })
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .returning();

  if (!client) throw new Error('Client not found');

  emitToWorkspace(workspaceId, 'client:deactivated', {
    clientId: client.id,
    clientName: `${client.firstName} ${client.lastName}`,
    deactivatedBy: actorId,
    reason,
    timestamp: new Date().toISOString(),
  });

  await writeAuditLog({
    workspaceId,
    actorId,
    action: 'deactivate',
    entityType: 'client',
    entityId: clientId,
    changes: { isActive: false, deactivationReason: reason, deactivatedAt: new Date() },
  });

  return client;
}

export async function reactivateClient(
  clientId: string,
  actorId: string,
  workspaceId: string
) {
  const [client] = await db
    .update(clients)
    .set({
      isActive: true,
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
    })
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .returning();

  if (!client) throw new Error('Client not found');

  emitToWorkspace(workspaceId, 'client:reactivated', {
    clientId: client.id,
    clientName: `${client.firstName} ${client.lastName}`,
    reactivatedBy: actorId,
    timestamp: new Date().toISOString(),
  });

  await writeAuditLog({
    workspaceId,
    actorId,
    action: 'reactivate',
    entityType: 'client',
    entityId: clientId,
    changes: { isActive: true, deactivatedAt: null },
  });

  return client;
}

// ============================================================================
// WORKSPACE DEACTIVATE / REACTIVATE (Support Staff Only)
// ============================================================================

export async function deactivateWorkspace(
  targetWorkspaceId: string,
  actorId: string,
  reason?: string
) {
  const [ws] = await db
    .update(workspaces)
    .set({
      isDeactivated: true,
      deactivatedAt: new Date(),
      deactivatedBy: actorId,
      deactivationReason: reason ?? null,
    })
    .where(eq(workspaces.id, targetWorkspaceId))
    .returning();

  if (!ws) throw new Error('Workspace not found');

  // Kick all users in this workspace
  if (io) {
    io.to(`workspace:${targetWorkspaceId}`).emit('workspace:deactivated', {
      workspaceId: targetWorkspaceId,
      reason: reason ?? 'This organization has been deactivated.',
      timestamp: new Date().toISOString(),
    });
    // Disconnect all sockets in the workspace room
    const sockets = await io.in(`workspace:${targetWorkspaceId}`).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }
  }

  // Invalidate all sessions in this workspace
  const orgEmployees = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(eq(employees.workspaceId, targetWorkspaceId));

  for (const emp of orgEmployees) {
    if (emp.userId) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.delete(sessions).where(eq(sessions.userId, emp.userId));
    }
  }

  await writeAuditLog({
    workspaceId: targetWorkspaceId,
    actorId,
    action: 'deactivate_workspace',
    entityType: 'workspace',
    entityId: targetWorkspaceId,
    changes: { isDeactivated: true, deactivationReason: reason, deactivatedAt: new Date() },
  });

  return ws;
}

export async function reactivateWorkspace(
  targetWorkspaceId: string,
  actorId: string
) {
  const [ws] = await db
    .update(workspaces)
    .set({
      isDeactivated: false,
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
    })
    .where(eq(workspaces.id, targetWorkspaceId))
    .returning();

  if (!ws) throw new Error('Workspace not found');

  emitToWorkspace(targetWorkspaceId, 'workspace:reactivated', {
    workspaceId: targetWorkspaceId,
    timestamp: new Date().toISOString(),
  });

  await writeAuditLog({
    workspaceId: targetWorkspaceId,
    actorId,
    action: 'reactivate_workspace',
    entityType: 'workspace',
    entityId: targetWorkspaceId,
    changes: { isDeactivated: false, deactivatedAt: null },
  });

  return ws;
}
