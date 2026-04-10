import { Request } from 'express';
import { db } from '../../db';
import { users, employees, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('sessionWorkspaceService');


export interface SessionWorkspaceContext {
  workspaceId: string;
  workspaceRole: string;
  employeeId: string | null;
  workspaceName: string;
}

export async function resolveAndCacheWorkspaceContext(
  req: Request,
  userId: string,
  explicitWorkspaceId?: string
): Promise<SessionWorkspaceContext | null> {
  const targetWorkspaceId = explicitWorkspaceId || req.session?.workspaceId;

  if (!targetWorkspaceId) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.currentWorkspaceId) {
      const [emp] = await db
        .select()
        .from(employees)
        .where(eq(employees.userId, userId))
        .limit(1);
      if (!emp) return null;

      await db
        .update(users)
        .set({ currentWorkspaceId: emp.workspaceId, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return await cacheWorkspaceInSession(req, userId, emp.workspaceId);
    }
    return await cacheWorkspaceInSession(req, userId, user.currentWorkspaceId);
  }

  return await cacheWorkspaceInSession(req, userId, targetWorkspaceId);
}

async function cacheWorkspaceInSession(
  req: Request,
  userId: string,
  workspaceId: string
): Promise<SessionWorkspaceContext | null> {
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name, ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return null;

  let role: string = 'viewer';
  let employeeId: string | null = null;

  if (workspace.ownerId === userId) {
    role = 'org_owner';
  }

  const [emp] = await db
    .select({ id: employees.id, workspaceRole: employees.workspaceRole })
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)))
    .limit(1);

  if (emp) {
    employeeId = emp.id;
    if (emp.workspaceRole) {
      role = emp.workspaceRole;
    }
  }

  if (role === 'viewer' && workspace.ownerId === userId) {
    role = 'org_owner';
  }

  const context: SessionWorkspaceContext = {
    workspaceId,
    workspaceRole: role,
    employeeId,
    workspaceName: workspace.name,
  };

  if (req.session) {
    req.session.workspaceId = context.workspaceId;
    (req as any).session.activeWorkspaceId = context.workspaceId;
    req.session.workspaceRole = context.workspaceRole;
    req.session.employeeId = context.employeeId || undefined;
    req.session.workspaceName = context.workspaceName;
  }

  return context;
}

export async function clearWorkspaceFromSession(req: Request): Promise<void> {
  if (req.session) {
    delete req.session.workspaceId;
    delete (req as any).session.activeWorkspaceId;
    delete req.session.workspaceRole;
    delete req.session.employeeId;
    delete req.session.workspaceName;
  }
}

export function getSessionWorkspaceContext(req: Request): SessionWorkspaceContext | null {
  if (!req.session?.workspaceId) return null;
  return {
    workspaceId: req.session.workspaceId,
    workspaceRole: req.session.workspaceRole || 'viewer',
    employeeId: req.session.employeeId || null,
    workspaceName: req.session.workspaceName || '',
  };
}

export async function saveSessionAsync(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        log.error('[Session] Save error:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
