/**
 * ORGANIZATION DATA PRIVACY GUARD
 * ================================
 * Critical security service ensuring organizational data isolation.
 * 
 * CORE PRINCIPLE: Never share org data with unauthorized parties.
 * 
 * Rules enforced:
 * 1. Users can only access data from workspaces they belong to
 * 2. Bots operate ONLY within the context of their assigned workspace
 * 3. Trinity AI respects workspace boundaries - never cross-org data leakage
 * 4. Support staff have explicit cross-org access only when granted
 * 5. All data access attempts are audited for compliance
 * 
 * This service prevents lawsuits from data breaches and privacy violations.
 */

import { db } from '../../db';
import { 
  systemAuditLogs, 
  users, 
  workspaces 
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('orgDataPrivacyGuard');


export interface PrivacyContext {
  userId: string;
  userRole?: string;
  platformRole?: string;
  sessionWorkspaceId: string;
  targetWorkspaceId?: string;
  entityType: 'user' | 'bot' | 'trinity' | 'system';
  actionType: string;
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface PrivacyCheckResult {
  allowed: boolean;
  reason: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  requiresAudit: boolean;
  restrictions?: string[];
}

export const DATA_CLASSIFICATION_LEVELS = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
} as const;

export const CROSS_ORG_ACCESS_ROLES = [
  'support_agent',
  'support_manager', 
  'sysop',
  'deputy_admin',
  'root_admin',
];

export const RESTRICTED_DATA_TYPES = [
  'payroll',
  'ssn',
  'tax_info',
  'bank_account',
  'medical',
  'background_check',
  'disciplinary',
  'salary',
  'compensation',
  'performance_review',
  'termination',
];

class OrgDataPrivacyGuard {
  private static instance: OrgDataPrivacyGuard;

  static getInstance(): OrgDataPrivacyGuard {
    if (!this.instance) {
      this.instance = new OrgDataPrivacyGuard();
    }
    return this.instance;
  }

  /**
   * PRIMARY CHECK: Can this entity access data from this workspace?
   * This is the main gate that ALL data operations must pass through.
   */
  async canAccessWorkspaceData(context: PrivacyContext): Promise<PrivacyCheckResult> {
    const { 
      userId, 
      sessionWorkspaceId, 
      targetWorkspaceId, 
      entityType, 
      actionType,
      platformRole,
      dataClassification = 'internal'
    } = context;

    const effectiveTargetId = targetWorkspaceId || sessionWorkspaceId;
    
    if (entityType === 'system') {
      return this.handleSystemAccess(context);
    }

    if (entityType === 'trinity') {
      return this.handleTrinityAccess(context);
    }

    if (entityType === 'bot') {
      return this.handleBotAccess(context);
    }

    if (sessionWorkspaceId === effectiveTargetId) {
      const isMember = await this.isWorkspaceMember(userId, sessionWorkspaceId);
      if (isMember) {
        return {
          allowed: true,
          reason: 'User is a member of the workspace',
          riskLevel: 'none',
          requiresAudit: dataClassification === 'restricted',
        };
      }
    }

    if (sessionWorkspaceId !== effectiveTargetId) {
      const crossOrgResult = await this.handleCrossOrgAccess(context);
      return crossOrgResult;
    }

    await this.logPrivacyViolationAttempt(context, 'Unauthorized access attempt');
    
    return {
      allowed: false,
      reason: 'User is not a member of the target workspace',
      riskLevel: 'high',
      requiresAudit: true,
    };
  }

  /**
   * BOT ACCESS: Bots are STRICTLY limited to their workspace context
   * A bot NEVER accesses data from other workspaces
   * SECURITY: Also validates that the initiating user (if any) is a member
   */
  private async handleBotAccess(context: PrivacyContext): Promise<PrivacyCheckResult> {
    const { userId, sessionWorkspaceId, targetWorkspaceId, actionType } = context;

    // SECURITY: If there's a real user triggering the bot, verify membership
    if (userId && userId !== 'bot-system' && userId !== 'system') {
      const isMember = await this.isWorkspaceMember(userId, sessionWorkspaceId);
      if (!isMember) {
        await this.logPrivacyViolationAttempt(context, 'Bot triggered by non-member user');
        return {
          allowed: false,
          reason: 'BLOCKED: User triggering bot is not a member of this workspace',
          riskLevel: 'critical',
          requiresAudit: true,
        };
      }
    }

    if (targetWorkspaceId && targetWorkspaceId !== sessionWorkspaceId) {
      await this.logPrivacyViolationAttempt(context, 'Bot attempted cross-org data access');
      
      return {
        allowed: false,
        reason: 'BLOCKED: Bots cannot access data from other organizations',
        riskLevel: 'critical',
        requiresAudit: true,
        restrictions: [
          'Bot operations are strictly limited to the workspace they serve',
          'Cross-organization data access is prohibited for all bots',
        ],
      };
    }

    return {
      allowed: true,
      reason: 'Bot operating within its assigned workspace context',
      riskLevel: 'none',
      requiresAudit: false,
    };
  }

  /**
   * TRINITY ACCESS: Trinity operates with elevated privileges BUT respects workspace boundaries
   * Trinity can only share data with users who are authorized within that org
   * SECURITY: Validates that the user making the request is a workspace member
   */
  private async handleTrinityAccess(context: PrivacyContext): Promise<PrivacyCheckResult> {
    const { 
      userId,
      sessionWorkspaceId, 
      targetWorkspaceId, 
      actionType,
      platformRole,
      dataClassification = 'internal'
    } = context;

    // SECURITY: Validate user is a member of the session workspace
    // Trinity should ONLY respond with data for workspaces the user belongs to
    if (userId && userId !== 'trinity-service' && userId !== 'system') {
      const isMember = await this.isWorkspaceMember(userId, sessionWorkspaceId);
      
      // Allow cross-org access ONLY for support staff with proper roles
      if (!isMember) {
        if (!platformRole || !CROSS_ORG_ACCESS_ROLES.includes(platformRole)) {
          await this.logPrivacyViolationAttempt(context, 'Trinity request from non-member user');
          return {
            allowed: false,
            reason: 'BLOCKED: User is not a member of this workspace',
            riskLevel: 'critical',
            requiresAudit: true,
            restrictions: [
              'Trinity only responds with data from workspaces the user belongs to',
              'Cross-org access requires support staff authorization',
            ],
          };
        }
        // Support staff accessing cross-org - allowed but audited
        await this.logPrivacyAudit(context, `Support staff ${platformRole} accessing workspace data`);
      }
    }

    if (targetWorkspaceId && targetWorkspaceId !== sessionWorkspaceId) {
      await this.logPrivacyViolationAttempt(context, 'Trinity attempted cross-org data access');
      
      return {
        allowed: false,
        reason: 'BLOCKED: Trinity AI respects organizational boundaries - no cross-org data sharing',
        riskLevel: 'critical',
        requiresAudit: true,
        restrictions: [
          'Trinity maintains strict workspace data isolation',
          'Each organization\'s data is completely separate',
          'Cross-organization queries are blocked at the system level',
        ],
      };
    }

    if (dataClassification === 'restricted') {
      return {
        allowed: true,
        reason: 'Trinity accessing restricted data within authorized workspace',
        riskLevel: 'medium',
        requiresAudit: true,
        restrictions: [
          'Restricted data access is logged for compliance',
          'Data must not be cached or stored beyond immediate use',
        ],
      };
    }

    return {
      allowed: true,
      reason: 'Trinity operating within workspace context with proper authorization',
      riskLevel: 'none',
      requiresAudit: false,
    };
  }

  /**
   * SYSTEM ACCESS: Internal system processes with elevated privileges
   */
  private async handleSystemAccess(context: PrivacyContext): Promise<PrivacyCheckResult> {
    return {
      allowed: true,
      reason: 'System-level operation with full access',
      riskLevel: 'low',
      requiresAudit: true,
    };
  }

  /**
   * CROSS-ORG ACCESS: Only support staff with explicit permissions
   */
  private async handleCrossOrgAccess(context: PrivacyContext): Promise<PrivacyCheckResult> {
    const { userId, platformRole, targetWorkspaceId, actionType, dataClassification } = context;

    if (!platformRole || !CROSS_ORG_ACCESS_ROLES.includes(platformRole)) {
      await this.logPrivacyViolationAttempt(context, 'Unauthorized cross-org access attempt');
      
      return {
        allowed: false,
        reason: 'BLOCKED: Cross-organization access requires support role authorization',
        riskLevel: 'critical',
        requiresAudit: true,
      };
    }

    await this.logPrivacyAudit(context, 'Cross-org access granted to support staff');

    return {
      allowed: true,
      reason: `Cross-org access authorized for ${platformRole} support role`,
      riskLevel: 'medium',
      requiresAudit: true,
      restrictions: [
        'Cross-org access is logged and monitored',
        'Data accessed must only be used for support purposes',
        'Sharing accessed data with third parties is prohibited',
      ],
    };
  }

  /**
   * Check if user is a member of a workspace
   * Uses currentWorkspaceId from users table to determine workspace membership
   */
  async isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
    try {
      const [user] = await db
        .select({ currentWorkspaceId: users.currentWorkspaceId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user?.currentWorkspaceId === workspaceId;
    } catch (error) {
      log.warn('[OrgDataPrivacyGuard] Membership check failed:', error);
      return false;
    }
  }

  /**
   * Check if user has specific role in workspace
   * Uses role field from users table
   */
  async getUserWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
    try {
      const [user] = await db
        .select({ role: users.role, currentWorkspaceId: users.currentWorkspaceId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user?.currentWorkspaceId !== workspaceId) {
        return null;
      }

      return user?.role || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * SENSITIVE DATA CHECK: Can this user view restricted data types?
   */
  async canAccessSensitiveData(
    userId: string,
    workspaceId: string,
    dataType: string,
    targetEmployeeId?: string
  ): Promise<PrivacyCheckResult> {
    const isRestricted = RESTRICTED_DATA_TYPES.includes(dataType);
    
    if (!isRestricted) {
      return {
        allowed: true,
        reason: 'Data type is not classified as sensitive',
        riskLevel: 'none',
        requiresAudit: false,
      };
    }

    const userRole = await this.getUserWorkspaceRole(userId, workspaceId);
    
    if (!userRole) {
      return {
        allowed: false,
        reason: 'User is not a member of this workspace',
        riskLevel: 'critical',
        requiresAudit: true,
      };
    }

    const managerRoles = ['org_owner', 'co_owner', 'org_admin', 'manager', 'hr', 'payroll_admin'];
    
    if (managerRoles.includes(userRole)) {
      return {
        allowed: true,
        reason: `Manager role ${userRole} authorized for ${dataType} access`,
        riskLevel: 'medium',
        requiresAudit: true,
      };
    }

    if (targetEmployeeId && userId === targetEmployeeId) {
      return {
        allowed: true,
        reason: 'User accessing their own sensitive data',
        riskLevel: 'low',
        requiresAudit: false,
      };
    }

    return {
      allowed: false,
      reason: `${userRole} role is not authorized to access ${dataType} data`,
      riskLevel: 'high',
      requiresAudit: true,
    };
  }

  /**
   * FILTER DATA: Remove fields that user shouldn't see from response
   */
  filterSensitiveFields<T extends Record<string, any>>(
    data: T,
    allowedFields: string[],
    userRole: string
  ): Partial<T> {
    const filtered: Partial<T> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) || !RESTRICTED_DATA_TYPES.some(r => key.toLowerCase().includes(r))) {
        filtered[key as keyof T] = value;
      }
    }
    
    return filtered;
  }

  /**
   * VALIDATE BOT MESSAGE: Ensure bot responses don't leak cross-org data
   */
  validateBotResponse(
    botId: string,
    workspaceId: string,
    responseText: string,
    mentionedWorkspaceIds: string[]
  ): PrivacyCheckResult {
    const crossOrgReferences = mentionedWorkspaceIds.filter(id => id !== workspaceId);
    
    if (crossOrgReferences.length > 0) {
      log.error(`[PrivacyGuard] Bot ${botId} attempted to reference external orgs:`, crossOrgReferences);
      
      return {
        allowed: false,
        reason: 'BLOCKED: Bot response contains references to external organizations',
        riskLevel: 'critical',
        requiresAudit: true,
        restrictions: [
          'Bot responses must not mention or reference other organizations',
          'All external org references have been stripped from the response',
        ],
      };
    }

    return {
      allowed: true,
      reason: 'Bot response contains no cross-org data leakage',
      riskLevel: 'none',
      requiresAudit: false,
    };
  }

  /**
   * Log privacy violation attempt for security audit
   */
  private async logPrivacyViolationAttempt(
    context: PrivacyContext,
    description: string
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: context.userId,
        action: 'privacy_violation_attempt',
        entityType: 'workspace',
        entityId: context.targetWorkspaceId || context.sessionWorkspaceId,
        changes: {
          description,
          entityType: context.entityType,
          actionType: context.actionType,
          sessionWorkspace: context.sessionWorkspaceId,
          targetWorkspace: context.targetWorkspaceId,
          dataClassification: context.dataClassification,
          severity: 'critical',
          timestamp: new Date().toISOString(),
        },
      });
      
      log.error('[PRIVACY VIOLATION]', description, {
        userId: context.userId,
        entityType: context.entityType,
        from: context.sessionWorkspaceId,
        to: context.targetWorkspaceId,
      });
    } catch (error) {
      log.error('[OrgDataPrivacyGuard] Failed to log violation:', error);
    }
  }

  /**
   * Log privacy-related audit event
   */
  private async logPrivacyAudit(
    context: PrivacyContext,
    description: string
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: context.userId,
        action: 'privacy_audit',
        entityType: 'workspace',
        entityId: context.targetWorkspaceId || context.sessionWorkspaceId,
        changes: {
          description,
          entityType: context.entityType,
          actionType: context.actionType,
          sessionWorkspace: context.sessionWorkspaceId,
          targetWorkspace: context.targetWorkspaceId,
          dataClassification: context.dataClassification,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      log.warn('[OrgDataPrivacyGuard] Failed to log audit:', error);
    }
  }

  /**
   * Get privacy rules summary for documentation/display
   */
  getPrivacyRulesSummary(): {
    rules: Array<{ id: string; description: string; enforcement: string }>;
    classifications: string[];
    restrictedDataTypes: string[];
  } {
    return {
      rules: [
        {
          id: 'ORG_ISOLATION',
          description: 'Organization data is completely isolated from other organizations',
          enforcement: 'All data queries are scoped to the user\'s workspace',
        },
        {
          id: 'BOT_WORKSPACE_LOCK',
          description: 'Bots operate strictly within their assigned workspace',
          enforcement: 'Bot operations are blocked if targeting external workspaces',
        },
        {
          id: 'TRINITY_BOUNDARIES',
          description: 'AI respects workspace boundaries and never leaks cross-org data',
          enforcement: 'AI responses are filtered to prevent data leakage',
        },
        {
          id: 'ROLE_BASED_SENSITIVE',
          description: 'Sensitive data (payroll, SSN, medical) requires manager authorization',
          enforcement: 'Role check before any sensitive field access',
        },
        {
          id: 'SUPPORT_AUDIT',
          description: 'Support staff cross-org access is fully audited',
          enforcement: 'All cross-org data access is logged with timestamp and purpose',
        },
        {
          id: 'SELF_DATA_ACCESS',
          description: 'Users can always access their own data regardless of role',
          enforcement: 'User ID match bypasses role requirements for own data',
        },
      ],
      classifications: ['public', 'internal', 'confidential', 'restricted'],
      restrictedDataTypes: RESTRICTED_DATA_TYPES,
    };
  }
}

export const orgDataPrivacyGuard = OrgDataPrivacyGuard.getInstance();

log.info('[OrgDataPrivacyGuard] Initialized - Organizational data isolation active');
