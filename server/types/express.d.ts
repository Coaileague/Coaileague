import type { User } from '@shared/schema/auth';
import type { WorkspaceRole, PlatformRole } from '@shared/lib/rbac/roleDefinitions';

/**
 * Properties added to req.user at runtime by auth middleware that aren't
 * part of the Drizzle `users` table schema. The middleware reads JWT claims,
 * resolves workspace context, and decorates the user object before handlers run.
 */
interface AuthMiddlewareUserExtensions {
  workspaceId?: string;
  currentWorkspaceId?: string;
  activeWorkspaceId?: string;
  workspaceRole?: WorkspaceRole | string;
  platformRole?: PlatformRole | string;
  role?: string;
  employeeId?: string;
  claims?: Record<string, unknown>;
  auditorWorkspaceId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: User & AuthMiddlewareUserExtensions;
      workspaceId?: string;
      currentWorkspaceId?: string;
      activeWorkspaceId?: string;
      workspaceRole?: WorkspaceRole;
      platformRole?: PlatformRole;
      employeeId?: string;
      userEmail?: string;
      claims?: Record<string, unknown>;
      isTestMode?: boolean;
      assertOwnsResource?: (resourceWorkspaceId: string | null | undefined, resourceType?: string) => void;
      getWorkspaceId?: () => string;
    }
  }
}

export {};
