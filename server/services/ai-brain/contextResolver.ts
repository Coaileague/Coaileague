/**
 * ContextResolver - Unified workspace/tenant/automation context management
 * 
 * Provides:
 * - Consistent user/workspace/platform scope resolution
 * - Permission and policy merging
 * - Escalation hooks for Trinity/notifications
 * - Cross-agent context passing
 */

import { storage } from '../../storage';
import { aiBrainEvents } from './internalEventEmitter';
import { createLogger } from '../../lib/logger';
const log = createLogger('contextResolver');

export interface ResolvedContext {
  userId?: string;
  workspaceId?: string;
  employeeId?: string;
  platformRole?: string;
  workspaceRole?: string;
  permissions: string[];
  isAutomation: boolean;
  isPlatformAdmin: boolean;
  hasEscalationRights: boolean;
  source: 'user' | 'automation' | 'scheduler' | 'webhook' | 'trinity' | 'helpai';
  metadata: Record<string, any>;
}

export interface ContextInput {
  userId?: string;
  workspaceId?: string;
  source?: 'user' | 'automation' | 'scheduler' | 'webhook' | 'trinity' | 'helpai';
  overrides?: Partial<ResolvedContext>;
}

const PLATFORM_ADMIN_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
const ESCALATION_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
const AUTOMATION_SOURCES = ['automation', 'scheduler', 'webhook'];

class ContextResolverService {
  private static instance: ContextResolverService;
  private contextCache: Map<string, { context: ResolvedContext; expiresAt: number }> = new Map();
  private cacheTTL = 60000;

  private constructor() {
    setInterval(() => this.cleanupCache(), 30000).unref();
  }

  static getInstance(): ContextResolverService {
    if (!ContextResolverService.instance) {
      ContextResolverService.instance = new ContextResolverService();
    }
    return ContextResolverService.instance;
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.contextCache.entries()) {
      if (value.expiresAt < now) {
        this.contextCache.delete(key);
      }
    }
  }

  async resolve(input: ContextInput): Promise<ResolvedContext> {
    const cacheKey = `${input.userId || 'anon'}:${input.workspaceId || 'none'}:${input.source || 'user'}`;
    const cached = this.contextCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.context, ...input.overrides };
    }

    const context = await this.buildContext(input);
    
    this.contextCache.set(cacheKey, {
      context,
      expiresAt: Date.now() + this.cacheTTL
    });

    return { ...context, ...input.overrides };
  }

  private async buildContext(input: ContextInput): Promise<ResolvedContext> {
    const source = input.source || 'user';
    const isAutomation = AUTOMATION_SOURCES.includes(source);

    const context: ResolvedContext = {
      userId: input.userId,
      workspaceId: input.workspaceId,
      permissions: [],
      isAutomation,
      isPlatformAdmin: false,
      hasEscalationRights: false,
      source,
      metadata: {}
    };

    if (!input.userId) {
      if (isAutomation) {
        context.permissions = ['automation.execute', 'system.read'];
        context.hasEscalationRights = true;
      }
      return context;
    }

    try {
      const user = await storage.getUser(input.userId);
      if (user) {
        context.platformRole = user.platformRole || undefined;
        context.isPlatformAdmin = PLATFORM_ADMIN_ROLES.includes(user.platformRole || '');
        context.hasEscalationRights = ESCALATION_ROLES.includes(user.platformRole || '');
        context.metadata.email = user.email;
        context.metadata.firstName = user.firstName;
      }

      if (!input.workspaceId && input.userId) {
        const workspace = await storage.getWorkspaceByOwnerId(input.userId);
        if (workspace) {
          context.workspaceId = workspace.id;
        } else {
          const member = await storage.getWorkspaceMemberByUserId(input.userId);
          if (member) {
            context.workspaceId = member.workspaceId;
          }
        }
      }

      if (context.workspaceId && input.userId) {
        const member = await storage.getWorkspaceMemberByUserId(input.userId);
        if (member) {
          context.workspaceRole = member.role;
        }

        const employee = await storage.getEmployeeByUserId(input.userId, context.workspaceId);
        if (employee) {
          context.employeeId = employee.id;
        }
      }

      context.permissions = this.buildPermissions(context);

      if (context.workspaceId) {
        try {
          const { workspaceContextService } = await import('./workspaceContextService');
          const wsCtx = await workspaceContextService.getFullContext(context.workspaceId);
          context.metadata.workspaceSummary = wsCtx.summary;
          context.metadata.workspaceStats = {
            employees: wsCtx.workforce.activeEmployees,
            clients: wsCtx.clients.activeClients,
            shiftsThisWeek: wsCtx.scheduling.shiftsThisWeek,
            openShifts: wsCtx.scheduling.openShifts,
            roles: wsCtx.workforce.roles,
          };
        } catch (wsErr) {
          log.warn(`[ContextResolver] Workspace context enrichment failed for ${context.workspaceId}:`, wsErr instanceof Error ? wsErr.message : wsErr);
        }
      }

    } catch (error) {
      log.error('[ContextResolver] Error building context:', error);
    }

    return context;
  }

  private buildPermissions(context: ResolvedContext): string[] {
    const permissions: string[] = ['read.own'];

    if (context.isPlatformAdmin) {
      permissions.push(
        'admin.all',
        'system.manage',
        'users.manage',
        'workspaces.manage',
        'automation.manage',
        'notifications.broadcast'
      );
    }

    if (context.hasEscalationRights) {
      permissions.push(
        'support.escalate',
        'notifications.send_platform',
        'trinity.command'
      );
    }

    if (context.isAutomation) {
      permissions.push(
        'automation.execute',
        'schedules.modify',
        'notifications.system'
      );
    }

    const workspaceRole = context.workspaceRole;
    if (workspaceRole) {
      switch (workspaceRole) {
        case 'org_owner':
        case 'co_owner':
          permissions.push(
            'workspace.manage',
            'employees.manage',
            'schedules.manage',
            'payroll.manage',
            'billing.manage'
          );
          break;
        case 'department_manager':
        case 'supervisor':
          permissions.push(
            'team.manage',
            'schedules.edit',
            'timesheets.approve'
          );
          break;
        case 'staff':
          permissions.push(
            'schedules.view',
            'timesheets.own'
          );
          break;
        case 'auditor':
          permissions.push(
            'reports.view',
            'audit.read'
          );
          break;
      }
    }

    return [...new Set(permissions)];
  }

  hasPermission(context: ResolvedContext, permission: string): boolean {
    if (context.isPlatformAdmin) return true;
    if (context.permissions.includes('admin.all')) return true;

    const [category, action] = permission.split('.');
    
    if (context.permissions.includes(permission)) return true;
    if (context.permissions.includes(`${category}.all`)) return true;
    if (context.permissions.includes(`${category}.manage`)) return true;

    return false;
  }

  async escalate(
    context: ResolvedContext,
    type: 'notification' | 'alert' | 'approval' | 'trinity',
    payload: Record<string, any>
  ): Promise<void> {
    if (!context.hasEscalationRights && !context.isPlatformAdmin) {
      log.warn('[ContextResolver] Escalation attempted without rights');
      return;
    }

    aiBrainEvents.emit('escalation_triggered', {
      type,
      context: {
        userId: context.userId,
        workspaceId: context.workspaceId,
        source: context.source,
      },
      payload,
      timestamp: new Date().toISOString(),
    });

    switch (type) {
      case 'notification':
        aiBrainEvents.emit('send_notification', payload);
        break;
      case 'alert':
        aiBrainEvents.emit('critical_alert', payload);
        break;
      case 'approval':
        aiBrainEvents.emit('approval_requested', payload);
        break;
      case 'trinity':
        aiBrainEvents.emit('trinity_command', payload);
        break;
    }
  }

  forAutomation(workspaceId?: string): ResolvedContext {
    return {
      workspaceId,
      permissions: ['automation.execute', 'system.read', 'schedules.modify', 'notifications.system'],
      isAutomation: true,
      isPlatformAdmin: false,
      hasEscalationRights: true,
      source: 'automation',
      metadata: { automated: true }
    };
  }

  forScheduler(workspaceId?: string): ResolvedContext {
    return {
      workspaceId,
      permissions: ['automation.execute', 'system.read', 'schedules.modify', 'notifications.system', 'payroll.process'],
      isAutomation: true,
      isPlatformAdmin: false,
      hasEscalationRights: true,
      source: 'scheduler',
      metadata: { scheduled: true }
    };
  }

  forTrinity(userId?: string, workspaceId?: string): ResolvedContext {
    return {
      userId,
      workspaceId,
      permissions: ['trinity.interact', 'notifications.view', 'tasks.suggest'],
      isAutomation: false,
      isPlatformAdmin: false,
      hasEscalationRights: false,
      source: 'trinity',
      metadata: { mascot: true }
    };
  }

  forHelpAI(userId?: string, workspaceId?: string): ResolvedContext {
    return {
      userId,
      workspaceId,
      permissions: ['helpai.chat', 'faq.search', 'tickets.create', 'automation.suggest'],
      isAutomation: false,
      isPlatformAdmin: false,
      hasEscalationRights: false,
      source: 'helpai',
      metadata: { ai_assistant: true }
    };
  }

  invalidateCache(userId?: string, workspaceId?: string): void {
    if (!userId && !workspaceId) {
      this.contextCache.clear();
      return;
    }

    for (const key of this.contextCache.keys()) {
      if (userId && key.startsWith(`${userId}:`)) {
        this.contextCache.delete(key);
      }
      if (workspaceId && key.includes(`:${workspaceId}:`)) {
        this.contextCache.delete(key);
      }
    }
  }
}

export const contextResolver = ContextResolverService.getInstance();
