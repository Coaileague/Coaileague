/**
 * AI BRAIN AUTHORIZATION SERVICE
 * =============================
 * Unified authorization layer ensuring only properly authenticated support staff
 * can command the AI Brain to perform platform actions.
 */

import { db } from '../../db';
import { systemAuditLogs, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

export const ROLE_HIERARCHY: Record<string, number> = {
  'none': 0,
  'employee': 1,
  'manager': 2,
  'supervisor': 3,
  'support_agent': 4,
  'support_manager': 5,
  'sysop': 6,
  'deputy_admin': 7,
  'root_admin': 8,
};

export const SUPPORT_ROLES = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];

export const AI_BRAIN_AUTHORITY_ROLES: Record<string, string[]> = {
  'scheduling': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'payroll': ['sysop', 'deputy_admin', 'root_admin'],
  'invoicing': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'analytics': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'compliance': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'notifications': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'gamification': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'automation': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'communication': ['manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'health': ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'user_assistance': ['employee', 'manager', 'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
  'system': ['sysop', 'deputy_admin', 'root_admin'],
};

export interface AuthorizationContext {
  userId: string;
  userRole: string;
  platformRole?: string;
  workspaceId?: string;
}

export interface ActionAuthCheck {
  userId: string;
  userRole: string;
  actionCategory: string;
  actionId: string;
  isAuthorized: boolean;
  reason?: string;
}

class AIBrainAuthorizationService {
  private static instance: AIBrainAuthorizationService;

  static getInstance(): AIBrainAuthorizationService {
    if (!this.instance) {
      this.instance = new AIBrainAuthorizationService();
    }
    return this.instance;
  }

  async canExecuteAction(context: AuthorizationContext, category: string, actionId: string): Promise<ActionAuthCheck> {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    const isAuthorized = requiredRoles.includes(context.userRole);
    
    await this.logAuthorizationCheck({
      userId: context.userId,
      userRole: context.userRole,
      actionId,
      category,
      isAuthorized,
      requiredRoles
    });
    
    return {
      userId: context.userId,
      userRole: context.userRole,
      actionCategory: category,
      actionId,
      isAuthorized,
      reason: isAuthorized 
        ? `Authorized: ${context.userRole} can execute ${category}.${actionId}`
        : `Unauthorized: ${context.userRole} requires one of [${requiredRoles.join(', ')}] to execute ${category}.${actionId}`
    };
  }

  async validateSupportStaff(userId: string): Promise<{ valid: boolean; role?: string; reason?: string }> {
    try {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      if (!user || user.length === 0) {
        return { valid: false, reason: 'User not found' };
      }

      const userRecord = user[0];
      const role = userRecord.platformRole as string;
      
      if (!SUPPORT_ROLES.includes(role)) {
        return {
          valid: false,
          role,
          reason: `User is ${role}, requires one of [${SUPPORT_ROLES.join(', ')}]`
        };
      }

      return { valid: true, role };
    } catch (error) {
      return { valid: false, reason: `Validation error: ${(error as any).message}` };
    }
  }

  requiresSupportRole(category: string): boolean {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    return SUPPORT_ROLES.some(role => requiredRoles.includes(role));
  }

  getMinimumRequiredRole(category: string): string {
    const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[category] || [];
    if (requiredRoles.length === 0) return 'employee';
    
    return requiredRoles.reduce((minRole, currentRole) => {
      const currentLevel = ROLE_HIERARCHY[currentRole] || 0;
      const minLevel = ROLE_HIERARCHY[minRole] || 0;
      return currentLevel < minLevel ? currentRole : minRole;
    });
  }

  getAccessibleCategories(userRole: string): string[] {
    const categories: string[] = [];
    for (const [category, requiredRoles] of Object.entries(AI_BRAIN_AUTHORITY_ROLES)) {
      if (requiredRoles.includes(userRole)) {
        categories.push(category);
      }
    }
    return categories;
  }

  private async logAuthorizationCheck(data: {
    userId: string;
    userRole: string;
    actionId: string;
    category: string;
    isAuthorized: boolean;
    requiredRoles: string[];
  }): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: data.userId,
        action: 'ai_brain_authorization_check',
        entityType: 'ai_brain_orchestrator',
        entityId: data.actionId,
        changes: {
          category: data.category,
          authorized: data.isAuthorized,
          userRole: data.userRole,
          requiredRoles: data.requiredRoles
        }
      });
    } catch (error) {
      console.warn('[AIBrainAuthorizationService] Failed to log auth check:', error);
    }
  }

  async logCommandExecution(data: {
    userId: string;
    userRole: string;
    actionId: string;
    category: string;
    parameters?: Record<string, any>;
    result?: any;
    error?: string;
  }): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        userId: data.userId,
        action: 'ai_brain_command_execution',
        entityType: 'ai_brain_orchestrator',
        entityId: data.actionId,
        changes: {
          category: data.category,
          parameters: data.parameters,
          result: data.result ? 'success' : 'failed',
          error: data.error
        }
      });
    } catch (error) {
      console.warn('[AIBrainAuthorizationService] Failed to log execution:', error);
    }
  }

  getPermissionSummary(userRole: string): {
    role: string;
    level: number;
    accessible_categories: string[];
    is_support_staff: boolean;
  } {
    return {
      role: userRole,
      level: ROLE_HIERARCHY[userRole] || 0,
      accessible_categories: this.getAccessibleCategories(userRole),
      is_support_staff: SUPPORT_ROLES.includes(userRole)
    };
  }
}

export const aiBrainAuthorizationService = AIBrainAuthorizationService.getInstance();
