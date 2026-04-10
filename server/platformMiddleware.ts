import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { platformRoles } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";

// @ts-expect-error — TS migration: fix in refactoring sprint
export interface PlatformRequest extends Request {
  user?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  };
}

const ADMIN_ROLES = ['root_admin', 'deputy_admin', 'sysop'] as const;
const STAFF_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'] as const;

async function queryPlatformRole(userId: string): Promise<string | null> {
  const [row] = await db.select({ role: platformRoles.role })
    .from(platformRoles)
    .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)))
    .limit(1);
  return row?.role || null;
}

/**
 * Require platform admin role (root_admin, deputy_admin, sysop)
 */
export async function requirePlatformAdmin(req: PlatformRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const role = await queryPlatformRole(req.user.id);
  if (!role || !ADMIN_ROLES.includes(role as any)) {
    return res.status(403).json({ 
      error: "Platform admin access required",
      currentRole: role 
    });
  }

  next();
}

/**
 * Require support staff or admin role
 */
export async function requireSupportStaff(req: PlatformRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const role = await queryPlatformRole(req.user.id);
  if (!role || !STAFF_ROLES.includes(role as any)) {
    return res.status(403).json({ 
      error: "Support staff or admin access required",
      currentRole: role 
    });
  }

  next();
}

/**
 * Check if user has platform-level access (any valid platform role)
 */
export async function hasPlatformAccess(userId: string): Promise<{ hasAccess: boolean; role: string | null }> {
  const role = await queryPlatformRole(userId);
  const hasAccess = !!role && STAFF_ROLES.includes(role as any);
  return { hasAccess, role };
}
