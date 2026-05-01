/**
 * Employee Role Synchronization Service
 * 
 * Automatically assigns workspace roles based on employee position/title,
 * notifies Trinity AI of role changes, and ensures mobile/desktop data sync.
 * 
 * Role Mapping:
 * - CEO, Owner, President, Founder → org_owner
 * - COO, VP, Director, Administrator → co_owner
 * - Manager, Department Head, Team Lead → department_manager
 * - Supervisor, Lead, Coordinator → supervisor
 * - Auditor, Compliance, Inspector → auditor
 * - Contractor, Temp, Freelance → contractor
 * - All others → staff
 */

import { db } from '../db';
import { employees, users, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { eventBus } from './trinity/eventBus';
import type { WorkspaceRole } from '../rbac';
import { inferPositionFromTitle, getPositionById, getWorkspaceRoleForPosition, getAuthorityLevel, type PositionDefinition } from '@shared/positionRegistry';
import { createLogger } from '../lib/logger';
const log = createLogger('employeeRoleSyncService');


interface RoleMappingRule {
  patterns: RegExp[];
  role: WorkspaceRole;
  priority: number;
}

const ROLE_MAPPING_RULES: RoleMappingRule[] = [
  {
    patterns: [/\b(ceo|owner|president|founder|proprietor)\b/i],
    role: 'org_owner',
    priority: 100,
  },
  {
    patterns: [/\b(coo|vp|vice.?president|director|administrator|admin|operations.?manager)\b/i],
    role: 'co_owner',
    priority: 90,
  },
  {
    patterns: [/\b(manager|department.?head|team.?lead|area.?manager|regional.?manager|branch.?manager|site.?manager|account.?manager)\b/i],
    role: 'department_manager',
    priority: 80,
  },
  {
    patterns: [/\b(supervisor|lead|shift.?lead|coordinator|foreman|crew.?lead|field.?supervisor)\b/i],
    role: 'supervisor',
    priority: 70,
  },
  {
    patterns: [/\b(auditor|compliance|inspector|quality.?assurance|qa)\b/i],
    role: 'auditor',
    priority: 60,
  },
  {
    patterns: [/\b(contractor|temp|temporary|freelance|consultant|1099|subcontractor)\b/i],
    role: 'contractor',
    priority: 50,
  },
];

export interface RoleChangeEvent {
  employeeId: string;
  userId: string | null;
  workspaceId: string;
  previousRole: WorkspaceRole | null;
  newRole: WorkspaceRole;
  reason: 'position_change' | 'manual_assignment' | 'onboarding' | 'promotion' | 'demotion';
  triggeredBy: string;
  timestamp: Date;
}

export interface EmployeeRoleSyncResult {
  employeeId: string;
  suggestedRole: WorkspaceRole;
  currentRole: WorkspaceRole | null;
  roleChanged: boolean;
  roleSource: 'position_title' | 'explicit_assignment' | 'default';
}

class EmployeeRoleSyncService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    eventBus.on('employee_created', this.handleEmployeeCreated.bind(this));
    eventBus.on('employee_updated', this.handleEmployeeUpdated.bind(this));
    eventBus.on('employee_position_changed', this.handlePositionChange.bind(this));
    eventBus.on('employee_title_changed', this.handleTitleChange.bind(this));
    eventBus.on('employee_promoted', this.handlePromotionDemotion.bind(this, 'promotion'));
    eventBus.on('employee_demoted', this.handlePromotionDemotion.bind(this, 'demotion'));

    log.info('[EmployeeRoleSync] Service initialized - listening for employee events (position, title, promotion, demotion)');
    this.initialized = true;
  }

  private async handleTitleChange(data: { employeeId: string; previousTitle?: string; newTitle?: string }): Promise<void> {
    log.info(`[EmployeeRoleSync] Title change detected for employee ${data.employeeId}: ${data.previousTitle} → ${data.newTitle}`);
    await this.syncEmployeeRole(data.employeeId, { 
      triggeredBy: 'title_change', 
      reason: 'position_change',
      forceUpdate: true,
    });
  }

  private async handlePromotionDemotion(type: 'promotion' | 'demotion', data: { employeeId: string }): Promise<void> {
    log.info(`[EmployeeRoleSync] ${type} event for employee ${data.employeeId}`);
    await this.syncEmployeeRole(data.employeeId, { 
      triggeredBy: `explicit_${type}`, 
      reason: type,
      forceUpdate: true,
    });
  }

  inferRoleFromPosition(position: string | null | undefined, title: string | null | undefined): WorkspaceRole {
    if (position) {
      const registryPos = getPositionById(position);
      if (registryPos) {
        return getWorkspaceRoleForPosition(position) as WorkspaceRole;
      }
    }

    const searchText = title || position || '';
    if (searchText) {
      const inferred = inferPositionFromTitle(searchText);
      if (inferred) {
        return inferred.workspaceRole as WorkspaceRole;
      }
    }

    const combinedText = `${position || ''} ${title || ''}`.toLowerCase().trim();
    if (!combinedText) {
      return 'staff';
    }

    let bestMatch: { role: WorkspaceRole; priority: number } = { role: 'staff', priority: 0 };
    for (const rule of ROLE_MAPPING_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(combinedText) && rule.priority > bestMatch.priority) {
          bestMatch = { role: rule.role, priority: rule.priority };
        }
      }
    }

    return bestMatch.role;
  }

  async syncEmployeeRole(
    employeeId: string,
    options: {
      forceUpdate?: boolean;
      triggeredBy?: string;
      reason?: RoleChangeEvent['reason'];
    } = {}
  ): Promise<EmployeeRoleSyncResult> {
    const { forceUpdate = false, triggeredBy = 'system', reason = 'position_change' } = options;

    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    const currentRole = (employee.workspaceRole as WorkspaceRole) || null;
    const suggestedRole = this.inferRoleFromPosition(
      employee.position || employee.role,
      employee.organizationalTitle
    );

    const roleSource = employee.role || employee.organizationalTitle ? 'position_title' : 'default';

    if (currentRole === suggestedRole && !forceUpdate) {
      return {
        employeeId,
        suggestedRole,
        currentRole,
        roleChanged: false,
        roleSource,
      };
    }

    const shouldUpdate = forceUpdate || currentRole !== suggestedRole;
    
    if (shouldUpdate) {
      await db
        .update(employees)
        .set({ 
          workspaceRole: suggestedRole,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, employeeId));

      const isPromotion = this.isPromotion(currentRole, suggestedRole);
      const isDemotion = this.isDemotion(currentRole, suggestedRole);
      
      const autoReason = isPromotion ? 'promotion' : isDemotion ? 'demotion' : reason;

      const roleChangeEvent: RoleChangeEvent = {
        employeeId,
        userId: employee.userId,
        workspaceId: employee.workspaceId,
        previousRole: currentRole,
        newRole: suggestedRole,
        reason: autoReason,
        triggeredBy,
        timestamp: new Date(),
      };

      await this.emitRoleChange(roleChangeEvent);

      log.info(`[EmployeeRoleSync] Updated role for employee ${employeeId}: ${currentRole} → ${suggestedRole} (${autoReason})`);

      return {
        employeeId,
        suggestedRole,
        currentRole,
        roleChanged: true,
        roleSource,
      };
    }

    return {
      employeeId,
      suggestedRole,
      currentRole,
      roleChanged: false,
      roleSource: 'explicit_assignment',
    };
  }

  async syncWorkspaceRoles(workspaceId: string, triggeredBy: string = 'system'): Promise<EmployeeRoleSyncResult[]> {
    const workspaceEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    const results: EmployeeRoleSyncResult[] = [];

    for (const employee of workspaceEmployees) {
      try {
        const result = await this.syncEmployeeRole(employee.id, { triggeredBy });
        results.push(result);
      } catch (error) {
        log.error(`[EmployeeRoleSync] Failed to sync employee ${employee.id}:`, error);
      }
    }

    return results;
  }

  async assignManagerRole(
    employeeId: string,
    newRole: WorkspaceRole,
    triggeredBy: string,
    reason: RoleChangeEvent['reason'] = 'manual_assignment'
  ): Promise<EmployeeRoleSyncResult> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    const currentRole = (employee.workspaceRole as WorkspaceRole) || null;

    await db
      .update(employees)
      .set({ 
        workspaceRole: newRole,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    const roleChangeEvent: RoleChangeEvent = {
      employeeId,
      userId: employee.userId,
      workspaceId: employee.workspaceId,
      previousRole: currentRole,
      newRole,
      reason,
      triggeredBy,
      timestamp: new Date(),
    };

    await this.emitRoleChange(roleChangeEvent);

    log.info(`[EmployeeRoleSync] Manager role assigned: ${employee.firstName} ${employee.lastName} → ${newRole}`);

    return {
      employeeId,
      suggestedRole: newRole,
      currentRole,
      roleChanged: true,
      roleSource: 'explicit_assignment',
    };
  }

  private async emitRoleChange(event: RoleChangeEvent): Promise<void> {
    eventBus.emit('employee_role_changed', event);

    eventBus.emit('trinity_context_update', {
      type: 'role_change',
      workspaceId: event.workspaceId,
      employeeId: event.employeeId,
      data: {
        previousRole: event.previousRole,
        newRole: event.newRole,
        reason: event.reason,
      },
      timestamp: event.timestamp,
    });

    const isPromotion = this.isPromotion(event.previousRole, event.newRole);
    const isDemotion = this.isDemotion(event.previousRole, event.newRole);

    if (isPromotion || isDemotion) {
      eventBus.emit('notification_trigger', {
        type: isPromotion ? 'employee_promoted' : 'employee_demoted',
        workspaceId: event.workspaceId,
        employeeId: event.employeeId,
        userId: event.userId,
        data: {
          previousRole: event.previousRole,
          newRole: event.newRole,
        },
      });
    }

    log.info(`[EmployeeRoleSync] Emitted role change event for Trinity: ${event.previousRole} → ${event.newRole}`);
  }

  private getRolePriority(role: WorkspaceRole | null): number {
    const priorities: Record<WorkspaceRole, number> = {
      org_owner: 100,
      co_owner: 90,
      department_manager: 80,
      supervisor: 70,
      auditor: 50,
      staff: 40,
      contractor: 30,
    };
    return role ? (priorities[role] || 0) : 0;
  }

  private isPromotion(previousRole: WorkspaceRole | null, newRole: WorkspaceRole): boolean {
    return this.getRolePriority(newRole) > this.getRolePriority(previousRole);
  }

  private isDemotion(previousRole: WorkspaceRole | null, newRole: WorkspaceRole): boolean {
    return this.getRolePriority(newRole) < this.getRolePriority(previousRole);
  }

  private async handleEmployeeCreated(data: { employeeId: string; workspaceId: string; triggeredBy?: string }): Promise<void> {
    try {
      await this.syncEmployeeRole(data.employeeId, {
        triggeredBy: data.triggeredBy || 'onboarding',
        reason: 'onboarding',
      });
    } catch (error) {
      log.error('[EmployeeRoleSync] Failed to sync new employee role:', error);
    }
  }

  private async handleEmployeeUpdated(data: { employeeId: string; changes: Record<string, any> }): Promise<void> {
    const hasRoleChange = data.changes.role || data.changes.position || data.changes.title || data.changes.organizationalTitle;
    
    if (hasRoleChange) {
      try {
        const isHierarchyChange = !!data.changes.organizationalTitle;
        await this.syncEmployeeRole(data.employeeId, {
          triggeredBy: 'employee_update',
          reason: isHierarchyChange ? 'position_change' : 'position_change',
          forceUpdate: isHierarchyChange,
        });
      } catch (error) {
        log.error('[EmployeeRoleSync] Failed to sync updated employee role:', error);
      }
    }
  }

  private async handlePositionChange(data: { employeeId: string; previousPosition: string; newPosition: string }): Promise<void> {
    try {
      await this.syncEmployeeRole(data.employeeId, {
        triggeredBy: 'position_change_event',
        reason: 'position_change',
        forceUpdate: true,
      });
    } catch (error) {
      log.error('[EmployeeRoleSync] Failed to sync position change:', error);
    }
  }

  async getEmployeeRoleContext(employeeId: string): Promise<{
    employee: any;
    currentRole: WorkspaceRole | null;
    suggestedRole: WorkspaceRole;
    roleMatchesPosition: boolean;
    canManage: string[];
  }> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!employee) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    const currentRole = (employee.workspaceRole as WorkspaceRole) || null;
    const suggestedRole = this.inferRoleFromPosition(employee.role, employee.organizationalTitle);

    const managementCapabilities: Record<WorkspaceRole, string[]> = {
      org_owner: ['all_employees', 'all_clients', 'all_schedules', 'billing', 'integrations', 'settings'],
      co_owner: ['all_employees', 'all_clients', 'all_schedules', 'some_settings'],
      department_manager: ['department_employees', 'department_clients', 'department_schedules'],
      supervisor: ['team_employees', 'team_schedules'],
      auditor: ['view_all', 'reports', 'compliance'],
      staff: ['own_schedule', 'own_time_entries'],
      contractor: ['own_schedule', 'own_time_entries'],
    };

    return {
      employee,
      currentRole,
      suggestedRole,
      roleMatchesPosition: currentRole === suggestedRole,
      canManage: currentRole ? managementCapabilities[currentRole] : [],
    };
  }
}

export const employeeRoleSyncService = new EmployeeRoleSyncService();
export default employeeRoleSyncService;
