import type { User } from '@shared/schema/auth';
import type { WorkspaceRole, PlatformRole } from '@shared/lib/rbac/roleDefinitions';

/**
 * Properties added to req.user at runtime by auth middleware that aren't
 * part of the Drizzle `users` table schema. The middleware reads JWT claims,
 * resolves workspace context, and decorates the user object before handlers run.
 */
interface AuthMiddlewareUserExtensions {
  userId?: string | null;
  workspaceId?: string | null;
  currentWorkspaceId?: string | null;
  activeWorkspaceId?: string | null;
  workspaceRole?: WorkspaceRole | string | null;
  platformRole?: PlatformRole | string | null;
  role?: string | null;
  employeeId?: string | null;
  claims?: Record<string, unknown> & {
    sub?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  auditorWorkspaceId?: string | null;
  auditorAccountId?: string | null;
  preferredLanguage?: string | null;
  username?: string | null;
  fullName?: string | null;
  name?: string | null;
  isPlatformAdmin?: boolean;
}

interface AuditContext {
  workspaceId?: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  isSupportElevated?: boolean;
  elevationId?: string;
  platformRole?: string;
  actionsExecuted?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: User & AuthMiddlewareUserExtensions;
      workspaceId?: string;
      currentWorkspaceId?: string;
      activeWorkspaceId?: string;
      workspaceRole?: WorkspaceRole | string;
      platformRole?: PlatformRole | string;
      employeeId?: string;
      userEmail?: string;
      claims?: Record<string, unknown>;
      isTestMode?: boolean;
      isTrinityBot?: boolean;
      assertOwnsResource?: (resourceWorkspaceId: string | null | undefined, resourceType?: string) => void;
      getWorkspaceId?: () => string;
      supportExecutorId?: string;
      executorPlatformRole?: string;
      executorLevel?: number;
      auditorId?: string;
      auditorAccountId?: string;
      auditorWorkspaceId?: string;
      auditorAccountVerified?: boolean;
      subscriptionTier?: string;
      terminatedEmployeeId?: string;
      terminatedGracePeriod?: boolean;
      documentAccessExpiresAt?: Date | string;
      _voiceSessionLang?: string;
      rawBody?: Buffer | string;
      requestId: string;
      auditContext?: AuditContext;
    }
  }
}

export {};
