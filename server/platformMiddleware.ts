import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const db = storage.db;

export interface PlatformRequest extends Request {
  user?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  };
}

/**
 * Require platform admin role (root/sysop access)
 */
export function requirePlatformAdmin(req: PlatformRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ 
      error: "Platform admin access required",
      currentRole: req.user.role 
    });
  }

  next();
}

/**
 * Require support staff or admin role
 */
export function requireSupportStaff(req: PlatformRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const allowedRoles = ["admin", "support_staff"];
  
  if (!req.user.role || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ 
      error: "Support staff or admin access required",
      currentRole: req.user.role 
    });
  }

  next();
}

/**
 * Check if user has platform-level access (admin or support)
 */
export async function hasPlatformAccess(userId: string): Promise<{ hasAccess: boolean; role: string | null }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { hasAccess: false, role: null };
  }

  const allowedRoles = ["admin", "support_staff"];
  const hasAccess = user.role ? allowedRoles.includes(user.role) : false;

  return { hasAccess, role: user.role || null };
}
