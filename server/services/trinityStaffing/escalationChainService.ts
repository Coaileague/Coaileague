/**
 * ESCALATION CHAIN SERVICE
 * =========================
 * Fast escalation chain for security industry staffing.
 * 
 * Tier timings (security industry speed requirement):
 * - Tier 1: 5 minutes  - Primary qualified employees
 * - Tier 2: 15 minutes - Secondary qualified employees  
 * - Tier 3: 30 minutes - Nearby qualified employees (expanded radius)
 * - Tier 4: 45 minutes - Manager notification
 * - Tier 5: 60 minutes - Owner escalation
 */

import { db, pool } from '../../db';
import { employees, shifts, users, workspaces, escalationChains } from '@shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { ROLES } from '@shared/platformConfig';
import { createNotification } from '../notificationService';
import { broadcastToWorkspace } from '../../websocket';
import { typedPoolExec } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('escalationChainService');


export interface EscalationTier {
  tier: number;
  name: string;
  minutesFromRequest: number;
  action: EscalationAction;
  notifyRoles: string[];
  expandSearchRadius: boolean;
  radiusMiles?: number;
}

export type EscalationAction = 
  | 'notify_primary_qualified'
  | 'notify_secondary_qualified'
  | 'expand_search_radius'
  | 'manager_escalation'
  | 'owner_escalation';

export interface EscalationState {
  requestId: string;
  workspaceId: string;
  currentTier: number;
  unfilledPositions: number;
  totalPositions: number;
  startedAt: Date;
  lastEscalatedAt: Date;
  notifiedEmployeeIds: string[];
  notifiedManagerIds: string[];
  status: 'active' | 'filled' | 'escalated_to_owner' | 'cancelled' | 'expired';
  /** Optional site GPS — enables Haversine radius filtering in findQualifiedEmployees */
  siteLat?: number | null;
  siteLon?: number | null;
}

export interface EscalationResult {
  success: boolean;
  newTier: number;
  action: EscalationAction;
  notifiedCount: number;
  nextEscalationAt?: Date;
  message: string;
}

const ESCALATION_TIERS: EscalationTier[] = [
  {
    tier: 1,
    name: 'Primary Qualified',
    minutesFromRequest: 5,
    action: 'notify_primary_qualified',
    notifyRoles: [],
    expandSearchRadius: false,
    radiusMiles: 15,
  },
  {
    tier: 2,
    name: 'Secondary Qualified',
    minutesFromRequest: 15,
    action: 'notify_secondary_qualified',
    notifyRoles: [],
    expandSearchRadius: false,
    radiusMiles: 25,
  },
  {
    tier: 3,
    name: 'Expanded Search',
    minutesFromRequest: 30,
    action: 'expand_search_radius',
    notifyRoles: [],
    expandSearchRadius: true,
    radiusMiles: 50,
  },
  {
    tier: 4,
    name: 'Manager Escalation',
    minutesFromRequest: 45,
    action: 'manager_escalation',
    notifyRoles: [ROLES.DEPARTMENT_MANAGER, ROLES.CO_OWNER],
    expandSearchRadius: true,
    radiusMiles: 75,
  },
  {
    tier: 5,
    name: 'Owner Escalation',
    minutesFromRequest: 60,
    action: 'owner_escalation',
    notifyRoles: [ROLES.WORKSPACE_OWNER],
    expandSearchRadius: true,
    radiusMiles: 100,
  },
];

class EscalationChainService {
  private activeEscalations: Map<string, EscalationState> = new Map();
  private intervalHandle: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    try {
      const { rows } = await pool.query<{
        id: string; workspace_id: string; current_tier: number;
        unfilled_positions: number; total_positions: number;
        started_at: string; last_escalated_at: string;
        notified_employee_ids: string[]; notified_manager_ids: string[];
        status: string;
      }>(`SELECT * FROM escalation_chains WHERE status = 'active'`);

      let rehydrated = 0;
      for (const row of rows) {
        const state: EscalationState = {
          requestId: row.id,
          workspaceId: row.workspace_id,
          currentTier: row.current_tier,
          unfilledPositions: row.unfilled_positions,
          totalPositions: row.total_positions,
          startedAt: new Date(row.started_at),
          lastEscalatedAt: new Date(row.last_escalated_at),
          notifiedEmployeeIds: Array.isArray(row.notified_employee_ids) ? row.notified_employee_ids : [],
          notifiedManagerIds: Array.isArray(row.notified_manager_ids) ? row.notified_manager_ids : [],
          status: row.status as EscalationState['status'],
        };
        this.activeEscalations.set(state.requestId, state);
        rehydrated++;
      }

      if (rehydrated > 0) {
        log.info(`[EscalationChain] Rehydrated ${rehydrated} active escalation(s) from DB`);
      }

      if (!this.intervalHandle) {
        this.intervalHandle = setInterval(() => {
          this.processScheduledEscalations().catch(e =>
            log.error('[EscalationChain] Scheduled escalation error:', e)
          );
        }, 60 * 1000);
      }
    } catch (error) {
      log.error('[EscalationChain] Failed to initialize persistence:', error);
    }
  }

  private async persistState(state: EscalationState): Promise<void> {
    try {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(escalationChains).values({
        id: state.requestId,
        workspaceId: state.workspaceId,
        currentTier: state.currentTier,
        unfilledPositions: state.unfilledPositions,
        totalPositions: state.totalPositions,
        startedAt: new Date(state.startedAt.toISOString()),
        lastEscalatedAt: new Date(state.lastEscalatedAt.toISOString()),
        notifiedEmployeeIds: state.notifiedEmployeeIds,
        notifiedManagerIds: state.notifiedManagerIds,
        status: state.status,
      }).onConflictDoUpdate({
        target: escalationChains.id,
        set: {
          currentTier: state.currentTier,
          unfilledPositions: state.unfilledPositions,
          lastEscalatedAt: new Date(state.lastEscalatedAt.toISOString()),
          notifiedEmployeeIds: state.notifiedEmployeeIds,
          notifiedManagerIds: state.notifiedManagerIds,
          status: state.status,
        },
      });
    } catch (error) {
      log.error('[EscalationChain] Failed to persist state:', error);
    }
  }

  /**
   * Start a new escalation chain for a staffing request
   */
  async startEscalation(
    requestId: string,
    workspaceId: string,
    positionsNeeded: number,
    siteLocation?: { lat: number; lon: number } | null
  ): Promise<EscalationState> {
    const now = new Date();
    
    const state: EscalationState = {
      requestId,
      workspaceId,
      currentTier: 0,
      unfilledPositions: positionsNeeded,
      totalPositions: positionsNeeded,
      startedAt: now,
      lastEscalatedAt: now,
      notifiedEmployeeIds: [],
      notifiedManagerIds: [],
      status: 'active',
      siteLat: siteLocation?.lat ?? null,
      siteLon: siteLocation?.lon ?? null,
    };
    
    this.activeEscalations.set(requestId, state);
    await this.persistState(state);
    
    await this.escalateToTier(requestId, 1);
    
    return state;
  }
  
  /**
   * Escalate to a specific tier
   */
  async escalateToTier(requestId: string, tier: number): Promise<EscalationResult> {
    const state = this.activeEscalations.get(requestId);
    if (!state) {
      return {
        success: false,
        newTier: 0,
        action: 'notify_primary_qualified',
        notifiedCount: 0,
        message: 'Escalation state not found',
      };
    }
    
    if (tier > ESCALATION_TIERS.length) {
      state.status = 'escalated_to_owner';
      await this.persistState(state);

      // Escalation chain exhausted — must still physically notify the owner
      let ownerNotifiedCount = 0;
      try {
        const owners = await db.select({
          id: employees.id,
          userId: employees.userId,
          email: employees.email,
          firstName: employees.firstName,
        })
        .from(employees)
        .where(
          and(
            eq(employees.workspaceId, state.workspaceId),
            eq(employees.isActive, true),
            eq(employees.workspaceRole, ROLES.WORKSPACE_OWNER)
          )
        );

        for (const owner of owners) {
          if (owner.userId) {
            await createNotification({
              workspaceId: state.workspaceId,
              userId: owner.userId,
              type: 'staffing_critical_escalation',
              title: `ALL TIERS EXHAUSTED: ${state.unfilledPositions} unfilled shift position(s)`,
              message: `Escalation for request ${state.requestId} has exceeded all ${ESCALATION_TIERS.length} automated tiers. ${state.unfilledPositions} of ${state.totalPositions} position(s) remain unfilled. Manual intervention required immediately.`,
              data: {
                requestId: state.requestId,
                tier: tier,
                unfilledPositions: state.unfilledPositions,
                totalPositions: state.totalPositions,
                allTiersExhausted: true,
              },
            });
            ownerNotifiedCount++;
          }
        }

        log.warn(`[EscalationChain] ALL TIERS EXHAUSTED for request ${state.requestId}: ${state.unfilledPositions}/${state.totalPositions} unfilled. Notified ${ownerNotifiedCount} owner(s).`);
      } catch (notifyErr) {
        log.error('[EscalationChain] CRITICAL: Failed to notify owner after all tiers exhausted:', notifyErr);
        broadcastToWorkspace(state.workspaceId, {
          type: 'escalation_all_tiers_exhausted',
          message: `ALL TIERS EXHAUSTED for request ${state.requestId} — ${state.unfilledPositions} positions unfilled. Owner notification failed. Manual check required.`,
          requestId: state.requestId,
          tier: tier,
        });
      }

      return {
        success: false,
        newTier: tier,
        action: 'owner_escalation',
        notifiedCount: ownerNotifiedCount,
        message: `All ${ESCALATION_TIERS.length} escalation tiers exhausted — ${state.unfilledPositions} position(s) still unfilled. Notified ${ownerNotifiedCount} owner(s). Manual intervention required.`,
      };
    }
    
    const tierConfig = ESCALATION_TIERS[tier - 1];
    state.currentTier = tier;
    state.lastEscalatedAt = new Date();
    
    let notifiedCount = 0;
    
    switch (tierConfig.action) {
      case 'notify_primary_qualified':
        notifiedCount = await this.notifyPrimaryEmployees(state, tierConfig);
        break;
      case 'notify_secondary_qualified':
        notifiedCount = await this.notifySecondaryEmployees(state, tierConfig);
        break;
      case 'expand_search_radius':
        notifiedCount = await this.notifyExpandedRadius(state, tierConfig);
        break;
      case 'manager_escalation':
        notifiedCount = await this.notifyManagers(state, tierConfig);
        break;
      case 'owner_escalation':
        notifiedCount = await this.notifyOwner(state, tierConfig);
        state.status = 'escalated_to_owner';
        break;
    }

    await this.persistState(state);
    
    const nextTier = tier < ESCALATION_TIERS.length ? tier + 1 : null;
    let nextEscalationAt: Date | undefined;
    
    if (nextTier) {
      const nextTierConfig = ESCALATION_TIERS[nextTier - 1];
      const minutesUntilNext = nextTierConfig.minutesFromRequest - tierConfig.minutesFromRequest;
      nextEscalationAt = new Date(Date.now() + minutesUntilNext * 60 * 1000);
    }
    
    return {
      success: true,
      newTier: tier,
      action: tierConfig.action,
      notifiedCount,
      nextEscalationAt,
      message: `Escalated to tier ${tier}: ${tierConfig.name}. Notified ${notifiedCount} recipients.`,
    };
  }
  
  /**
   * Notify primary qualified employees (highest match scores)
   */
  private async notifyPrimaryEmployees(
    state: EscalationState,
    tierConfig: EscalationTier
  ): Promise<number> {
    const qualifiedEmployees = await this.findQualifiedEmployees(
      state.workspaceId,
      tierConfig.radiusMiles || 15,
      state.notifiedEmployeeIds,
      5,
      state.siteLat,
      state.siteLon,
    );
    
    for (const emp of qualifiedEmployees) {
      if (!state.notifiedEmployeeIds.includes(emp.id)) {
        state.notifiedEmployeeIds.push(emp.id);
      }
    }
    
    log.info(`[EscalationChain] Tier ${tierConfig.tier}: Notified ${qualifiedEmployees.length} primary employees`);
    
    return qualifiedEmployees.length;
  }
  
  /**
   * Notify secondary qualified employees
   */
  private async notifySecondaryEmployees(
    state: EscalationState,
    tierConfig: EscalationTier
  ): Promise<number> {
    const qualifiedEmployees = await this.findQualifiedEmployees(
      state.workspaceId,
      tierConfig.radiusMiles || 25,
      state.notifiedEmployeeIds,
      10,
      state.siteLat,
      state.siteLon,
    );
    
    for (const emp of qualifiedEmployees) {
      if (!state.notifiedEmployeeIds.includes(emp.id)) {
        state.notifiedEmployeeIds.push(emp.id);
      }
    }
    
    log.info(`[EscalationChain] Tier ${tierConfig.tier}: Notified ${qualifiedEmployees.length} secondary employees`);
    
    return qualifiedEmployees.length;
  }
  
  /**
   * Notify employees in expanded radius
   */
  private async notifyExpandedRadius(
    state: EscalationState,
    tierConfig: EscalationTier
  ): Promise<number> {
    const qualifiedEmployees = await this.findQualifiedEmployees(
      state.workspaceId,
      tierConfig.radiusMiles || 50,
      state.notifiedEmployeeIds,
      20,
      state.siteLat,
      state.siteLon,
    );
    
    for (const emp of qualifiedEmployees) {
      if (!state.notifiedEmployeeIds.includes(emp.id)) {
        state.notifiedEmployeeIds.push(emp.id);
      }
    }
    
    log.info(`[EscalationChain] Tier ${tierConfig.tier}: Notified ${qualifiedEmployees.length} employees (expanded radius)`);
    
    return qualifiedEmployees.length;
  }
  
  /**
   * Notify managers about unfilled positions
   */
  private async notifyManagers(
    state: EscalationState,
    tierConfig: EscalationTier
  ): Promise<number> {
    log.info(`[EscalationChain] Tier ${tierConfig.tier}: MANAGER ESCALATION - ${state.unfilledPositions} unfilled positions`);
    
    try {
      const managers = await db.select({
        id: employees.id,
        userId: employees.userId,
        email: employees.email,
        firstName: employees.firstName,
        workspaceRole: employees.workspaceRole,
      })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, state.workspaceId),
          eq(employees.isActive, true),
          inArray(employees.workspaceRole, [ROLES.DEPARTMENT_MANAGER, ROLES.CO_OWNER])
        )
      );

      let notifiedCount = 0;
      for (const manager of managers) {
        if (!state.notifiedManagerIds.includes(manager.id)) {
          state.notifiedManagerIds.push(manager.id);
          
          if (manager.userId) {
            await createNotification({
              userId: manager.userId,
              type: 'staffing_escalation',
              title: `URGENT: ${state.unfilledPositions} position(s) still need staffing`,
              message: `Request ${state.requestId} has been escalated to management after 45 minutes without full coverage. Please review and assign staff immediately.`,
              data: { requestId: state.requestId, tier: 4, unfilledPositions: state.unfilledPositions },
              workspaceId: state.workspaceId,
              idempotencyKey: `staffing_escalation-${Date.now()}-${manager.userId}`
            });
            notifiedCount++;
          }
        }
      }
      
      log.info(`[EscalationChain] Tier 4: Notified ${notifiedCount} managers about unfilled positions`);
      return notifiedCount;
    } catch (error) {
      log.error('[EscalationChain] CRITICAL: Failed to notify managers — escalation tier may appear silent:', error);
      broadcastToWorkspace?.(state.workspaceId, {
        type: 'escalation_notification_failure',
        message: `Manager notification failed for request ${state.requestId} — ${state.unfilledPositions} positions still unfilled`,
        tier: 4,
        requestId: state.requestId,
      });
      return 0;
    }
  }
  
  /**
   * Notify owner about critical unfilled positions
   */
  private async notifyOwner(
    state: EscalationState,
    tierConfig: EscalationTier
  ): Promise<number> {
    log.info(`[EscalationChain] Tier ${tierConfig.tier}: OWNER ESCALATION - ${state.unfilledPositions} positions still unfilled after 60 minutes`);
    
    try {
      const owners = await db.select({
        id: employees.id,
        userId: employees.userId,
        email: employees.email,
        firstName: employees.firstName,
      })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, state.workspaceId),
          eq(employees.isActive, true),
          eq(employees.workspaceRole, ROLES.WORKSPACE_OWNER)
        )
      );

      let notifiedCount = 0;
      for (const owner of owners) {
        if (owner.userId) {
          await createNotification({
            userId: owner.userId,
            type: 'staffing_critical_escalation',
            title: `CRITICAL: Staffing emergency - ${state.unfilledPositions} unfilled position(s)`,
            message: `Request ${state.requestId} requires immediate attention. After 60 minutes, ${state.unfilledPositions} of ${state.totalPositions} positions remain unfilled despite all escalation attempts.`,
            data: { requestId: state.requestId, tier: 5, unfilledPositions: state.unfilledPositions, totalPositions: state.totalPositions },
            workspaceId: state.workspaceId,
            idempotencyKey: `staffing_critical_escalation-${Date.now()}-${owner.userId}`
          });
          notifiedCount++;
        }
      }
      
      log.info(`[EscalationChain] Tier 5: Notified ${notifiedCount} owners about critical escalation`);
      return notifiedCount;
    } catch (error) {
      log.error('[EscalationChain] CRITICAL: Failed to notify owners — escalation chain stalled:', error);
      broadcastToWorkspace(state.workspaceId, {
        type: 'escalation_notification_failure',
        message: `Owner notification failed for request ${state.requestId} — ${state.unfilledPositions} positions still unfilled (CRITICAL)`,
        tier: 5,
        requestId: state.requestId,
      });
      return 0;
    }
  }
  
  /**
   * Haversine helper — returns distance in miles between two GPS points.
   */
  private haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  private async findQualifiedEmployees(
    workspaceId: string,
    radiusMiles: number,
    excludeIds: string[],
    limit: number,
    siteLat?: number | null,
    siteLon?: number | null,
  ): Promise<any[]> {
    const allActive = await db.select({
      id: employees.id,
      userId: employees.userId,
      email: employees.email,
      firstName: employees.firstName,
      lastName: employees.lastName,
      workspaceRole: employees.workspaceRole,
    })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      );

    const candidates = allActive.filter(emp => !excludeIds.includes(emp.id));

    if (siteLat != null && siteLon != null) {
      // NOTE: Employee home GPS coordinates are not yet stored in the schema.
      // The Haversine infrastructure is in place; once employees.homeLatitude /
      // employees.homeLongitude columns are added and populated, replace the
      // block below with actual distance filtering using this.haversineMiles().
      //
      // For now: log a clear warning and return all candidates within limit
      // so escalations are never silently blocked by the missing filter.
      log.warn(
        `[EscalationChain] findQualifiedEmployees: site=(${siteLat},${siteLon}), radius=${radiusMiles}mi — ` +
        `Haversine filtering SKIPPED (employees.homeLatitude/homeLongitude not in schema). ` +
        `Returning ${Math.min(candidates.length, limit)} of ${candidates.length} active employees.`
      );
    } else {
      log.info(
        `[EscalationChain] findQualifiedEmployees: no site location — ` +
        `returning ${Math.min(candidates.length, limit)} of ${candidates.length} active employees`
      );
    }

    return candidates.slice(0, limit);
  }
  
  /**
   * Mark a position as filled (reduces unfilled count)
   */
  async positionFilled(requestId: string): Promise<void> {
    const state = this.activeEscalations.get(requestId);
    if (state) {
      state.unfilledPositions--;
      if (state.unfilledPositions <= 0) {
        state.status = 'filled';
        log.info(`[EscalationChain] Request ${requestId} fully staffed!`);
      }
      await this.persistState(state);
    }
  }
  
  /**
   * Cancel an escalation
   */
  async cancelEscalation(requestId: string, reason: string): Promise<void> {
    const state = this.activeEscalations.get(requestId);
    if (state) {
      state.status = 'cancelled';
      log.info(`[EscalationChain] Escalation ${requestId} cancelled: ${reason}`);
      await this.persistState(state);
    }
  }
  
  /**
   * Get current escalation state
   */
  getEscalationState(requestId: string): EscalationState | undefined {
    return this.activeEscalations.get(requestId);
  }
  
  /**
   * Get escalation tier configuration
   */
  getEscalationTiers(): EscalationTier[] {
    return ESCALATION_TIERS;
  }
  
  /**
   * Check for escalations that need to be triggered
   * Call this from a scheduled job
   */
  async processScheduledEscalations(): Promise<void> {
    const now = Date.now();
    
    for (const [requestId, state] of this.activeEscalations) {
      if (state.status !== 'active') continue;
      if (state.unfilledPositions <= 0) continue;
      
      const minutesSinceStart = (now - state.startedAt.getTime()) / (60 * 1000);
      
      for (const tier of ESCALATION_TIERS) {
        if (tier.tier > state.currentTier && minutesSinceStart >= tier.minutesFromRequest) {
          await this.escalateToTier(requestId, tier.tier);
          break;
        }
      }
    }
  }
}

export const escalationChainService = new EscalationChainService();
