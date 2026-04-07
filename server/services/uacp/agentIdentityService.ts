/**
 * AGENT IDENTITY SERVICE
 * ======================
 * Manages non-human entity identities (bots, subagents, Trinity, services).
 * Provides identity lifecycle, authentication, and access control for AI agents.
 * 
 * Key Features:
 * - Agent registration and lifecycle management
 * - Short-lived token generation (5-15 minute expiry)
 * - Rate limiting per agent
 * - Mission/objective tracking
 * - Real-time access suspension with event propagation
 */

import { db } from '../../db';
import { 
  agentIdentities, 
  accessControlEvents,
  systemAuditLogs,
  InsertAgentIdentity,
  AgentIdentity 
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { policyDecisionPoint, EntityType } from './policyDecisionPoint';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('agentIdentityService');


export interface AgentToken {
  token: string;
  agentId: string;
  entityType: EntityType;
  expiresAt: Date;
  permissions: string[];
  workspaceId?: string;
  role?: string;
}

export interface AgentRegistrationRequest {
  agentId: string;
  name: string;
  description?: string;
  entityType: EntityType;
  workspaceId?: string;
  isGlobal?: boolean;
  role?: string;
  permissions?: string[];
  allowedTools?: string[];
  allowedDomains?: string[];
  missionObjective?: string;
  riskProfile?: 'low' | 'medium' | 'high' | 'critical';
  maxAutonomyLevel?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  tokenExpiryMinutes?: number;
  createdBy: string;
}

class AgentIdentityService {
  private static instance: AgentIdentityService;
  private activeTokens: Map<string, AgentToken> = new Map();

  static getInstance(): AgentIdentityService {
    if (!this.instance) {
      this.instance = new AgentIdentityService();
    }
    return this.instance;
  }

  /**
   * Register a new agent identity
   */
  async registerAgent(request: AgentRegistrationRequest): Promise<{ success: boolean; agent?: AgentIdentity; error?: string }> {
    try {
      // Check if agent already exists
      const existing = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, request.agentId))
        .limit(1);

      if (existing.length > 0) {
        return { success: false, error: `Agent ${request.agentId} already registered` };
      }

      const [agent] = await db.insert(agentIdentities).values({
        agentId: request.agentId,
        name: request.name,
        description: request.description,
        entityType: request.entityType,
        workspaceId: request.workspaceId,
        isGlobal: request.isGlobal || false,
        status: 'active',
        role: request.role,
        permissions: request.permissions,
        allowedTools: request.allowedTools,
        allowedDomains: request.allowedDomains,
        missionObjective: request.missionObjective,
        riskProfile: request.riskProfile || 'low',
        maxAutonomyLevel: request.maxAutonomyLevel || 3,
        requestsPerMinute: request.requestsPerMinute || 60,
        requestsPerHour: request.requestsPerHour || 1000,
        tokenExpiryMinutes: request.tokenExpiryMinutes || 15,
        createdBy: request.createdBy,
      }).returning();

      // Emit registration event
      await this.emitAccessControlEvent({
        eventType: 'agent_registered',
        actorType: 'human',
        actorId: request.createdBy,
        targetType: request.entityType,
        targetId: request.agentId,
        workspaceId: request.workspaceId,
        changeDetails: {
          action: 'register',
          agentName: request.name,
          role: request.role,
          permissions: request.permissions,
        },
        newState: agent,
      });

      log.info(`[AgentIdentity] Registered new agent: ${request.agentId} (${request.entityType})`);
      return { success: true, agent };

    } catch (error) {
      log.error('[AgentIdentity] Registration failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Issue a short-lived token for an agent
   */
  async issueToken(agentId: string): Promise<{ success: boolean; token?: AgentToken; error?: string }> {
    try {
      const [agent] = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, agentId))
        .limit(1);

      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      if (agent.status !== 'active') {
        return { success: false, error: `Agent is ${agent.status}` };
      }

      // Check rate limits
      const now = new Date();
      if (agent.tokenCount24h! >= 1000) {
        return { success: false, error: 'Token issuance limit exceeded (24h)' };
      }

      // Generate cryptographically secure token
      const tokenValue = crypto.randomBytes(32).toString('base64url');
      const expiryMinutes = agent.tokenExpiryMinutes || 15;
      const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);

      const token: AgentToken = {
        token: tokenValue,
        agentId: agent.agentId,
        entityType: agent.entityType as EntityType,
        expiresAt,
        permissions: agent.permissions || [],
        workspaceId: agent.workspaceId || undefined,
        role: agent.role || undefined,
      };

      // Store token in memory (short-lived)
      this.activeTokens.set(tokenValue, token);

      // Update agent record
      await db.update(agentIdentities)
        .set({
          lastTokenIssuedAt: now,
          tokenCount24h: (agent.tokenCount24h || 0) + 1,
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(eq(agentIdentities.id, agent.id));

      // Schedule token cleanup
      setTimeout(() => {
        this.activeTokens.delete(tokenValue);
      }, expiryMinutes * 60 * 1000);

      return { success: true, token };

    } catch (error) {
      log.error('[AgentIdentity] Token issuance failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Validate an agent token
   */
  validateToken(tokenValue: string): { valid: boolean; token?: AgentToken; error?: string } {
    const token = this.activeTokens.get(tokenValue);
    
    if (!token) {
      return { valid: false, error: 'Token not found or expired' };
    }

    if (new Date() > token.expiresAt) {
      this.activeTokens.delete(tokenValue);
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, token };
  }

  /**
   * Revoke an agent's token immediately
   */
  revokeToken(tokenValue: string): boolean {
    return this.activeTokens.delete(tokenValue);
  }

  /**
   * Suspend an agent's access - triggers immediate propagation
   */
  async suspendAgent(
    agentId: string, 
    suspendedBy: string, 
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [agent] = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, agentId))
        .limit(1);

      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      const previousState = { ...agent };

      await db.update(agentIdentities)
        .set({
          status: 'suspended',
          suspendedAt: new Date(),
          suspendedBy,
          suspensionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(agentIdentities.id, agent.id));

      // Revoke all active tokens for this agent
      for (const [tokenValue, token] of this.activeTokens.entries()) {
        if (token.agentId === agentId) {
          this.activeTokens.delete(tokenValue);
        }
      }

      // Emit HIGH PRIORITY suspension event for immediate propagation
      await this.emitAccessControlEvent({
        eventType: 'access_suspended',
        priority: 'critical',
        actorType: 'human',
        actorId: suspendedBy,
        targetType: agent.entityType as EntityType,
        targetId: agentId,
        workspaceId: agent.workspaceId || undefined,
        changeDetails: {
          action: 'suspend',
          reason,
        },
        previousState,
        newState: { ...agent, status: 'suspended' },
      });

      // Broadcast via platform event bus for real-time enforcement
      await platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'security',
        title: `Agent Suspended: ${agentId}`,
        description: `Agent ${agent.name} has been suspended. Reason: ${reason}`,
        metadata: {
          agentId,
          action: 'suspend',
          severity: 'high',
        },
        visibility: 'admin',
      });

      // Invalidate PDP cache
      policyDecisionPoint.invalidateCache(agent.workspaceId || undefined);

      log.info(`[AgentIdentity] Agent ${agentId} SUSPENDED by ${suspendedBy}: ${reason}`);
      return { success: true };

    } catch (error) {
      log.error('[AgentIdentity] Suspension failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Reactivate a suspended agent
   */
  async reactivateAgent(agentId: string, reactivatedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [agent] = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, agentId))
        .limit(1);

      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      if (agent.status === 'active') {
        return { success: false, error: 'Agent is already active' };
      }

      const previousState = { ...agent };

      await db.update(agentIdentities)
        .set({
          status: 'active',
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(agentIdentities.id, agent.id));

      await this.emitAccessControlEvent({
        eventType: 'access_restored',
        actorType: 'human',
        actorId: reactivatedBy,
        targetType: agent.entityType as EntityType,
        targetId: agentId,
        workspaceId: agent.workspaceId || undefined,
        changeDetails: {
          action: 'reactivate',
          previousStatus: agent.status,
        },
        previousState,
        newState: { ...agent, status: 'active' },
      });

      policyDecisionPoint.invalidateCache(agent.workspaceId || undefined);

      log.info(`[AgentIdentity] Agent ${agentId} REACTIVATED by ${reactivatedBy}`);
      return { success: true };

    } catch (error) {
      log.error('[AgentIdentity] Reactivation failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Update agent's mission objective (for Trinity context)
   */
  async updateMission(agentId: string, missionObjective: string, updatedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const [agent] = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, agentId))
        .limit(1);

      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      await db.update(agentIdentities)
        .set({
          missionObjective,
          updatedAt: new Date(),
        })
        .where(eq(agentIdentities.id, agent.id));

      await this.emitAccessControlEvent({
        eventType: 'mission_updated',
        actorType: 'human',
        actorId: updatedBy,
        targetType: agent.entityType as EntityType,
        targetId: agentId,
        workspaceId: agent.workspaceId || undefined,
        changeDetails: {
          action: 'update_mission',
          previousMission: agent.missionObjective,
          newMission: missionObjective,
        },
      });

      return { success: true };

    } catch (error) {
      log.error('[AgentIdentity] Mission update failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Update agent permissions/tools
   */
  async updateAgentAccess(
    agentId: string,
    updates: {
      role?: string;
      permissions?: string[];
      deniedPermissions?: string[];
      allowedTools?: string[];
      deniedTools?: string[];
      allowedDomains?: string[];
      riskProfile?: string;
      maxAutonomyLevel?: number;
    },
    updatedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [agent] = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, agentId))
        .limit(1);

      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      const previousState = { ...agent };

      await db.update(agentIdentities)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(agentIdentities.id, agent.id));

      await this.emitAccessControlEvent({
        eventType: 'permissions_changed',
        actorType: 'human',
        actorId: updatedBy,
        targetType: agent.entityType as EntityType,
        targetId: agentId,
        workspaceId: agent.workspaceId || undefined,
        changeDetails: {
          action: 'update_access',
          updates,
        },
        previousState,
        newState: { ...agent, ...updates },
      });

      policyDecisionPoint.invalidateCache(agent.workspaceId || undefined);

      return { success: true };

    } catch (error) {
      log.error('[AgentIdentity] Access update failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<AgentIdentity | null> {
    const [agent] = await db.select()
      .from(agentIdentities)
      .where(eq(agentIdentities.agentId, agentId))
      .limit(1);
    return agent || null;
  }

  /**
   * List all agents (optionally filtered by workspace)
   */
  async listAgents(workspaceId?: string): Promise<AgentIdentity[]> {
    if (workspaceId) {
      return db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.workspaceId, workspaceId))
        .orderBy(desc(agentIdentities.createdAt));
    }
    return db.select()
      .from(agentIdentities)
      .orderBy(desc(agentIdentities.createdAt));
  }

  /**
   * Record an authentication event for an agent
   */
  async recordAuthentication(agentId: string): Promise<void> {
    const now = new Date();
    await db.update(agentIdentities)
      .set({
        lastActiveAt: now,
        currentMinuteRequests: 1, // Reset or increment based on time
        lastRequestAt: now,
      })
      .where(eq(agentIdentities.agentId, agentId));
  }

  /**
   * Emit access control event for propagation
   */
  private async emitAccessControlEvent(data: {
    eventType: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    actorType: EntityType;
    actorId: string;
    actorRole?: string;
    targetType: EntityType;
    targetId: string;
    workspaceId?: string;
    changeDetails: any;
    previousState?: any;
    newState?: any;
  }): Promise<void> {
    try {
      await db.insert(accessControlEvents).values({
        eventType: data.eventType,
        priority: data.priority || 'normal',
        actorType: data.actorType,
        actorId: data.actorId,
        actorRole: data.actorRole,
        targetType: data.targetType,
        targetId: data.targetId,
        workspaceId: data.workspaceId,
        changeDetails: data.changeDetails,
        previousState: data.previousState,
        newState: data.newState,
        propagated: false,
      });

      // Trigger immediate propagation for critical events
      if (data.priority === 'critical' || data.priority === 'high') {
        await platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'security',
          title: `Access Control: ${data.eventType}`,
          description: `${data.targetType} ${data.targetId} - ${data.eventType}`,
          metadata: {
            ...data.changeDetails,
            eventType: data.eventType,
          },
          visibility: 'admin',
        });
      }
    } catch (error) {
      log.error('[AgentIdentity] Failed to emit event:', error);
    }
  }

  /**
   * Seed default platform agents (Trinity, core subagents)
   */
  async seedPlatformAgents(createdBy: string): Promise<void> {
    const defaultAgents: AgentRegistrationRequest[] = [
      {
        agentId: 'trinity-orchestrator',
        name: 'Trinity AI Orchestrator',
        description: 'Central AI Brain orchestrator coordinating all platform operations',
        entityType: 'trinity',
        isGlobal: true,
        role: 'root_admin',
        permissions: ['*'],
        allowedDomains: ['*'],
        riskProfile: 'low',
        maxAutonomyLevel: 5,
        requestsPerMinute: 1000,
        requestsPerHour: 10000,
        tokenExpiryMinutes: 60,
        createdBy,
      },
      {
        agentId: 'subagent-payroll',
        name: 'Payroll Subagent',
        description: 'Handles payroll calculations and processing',
        entityType: 'subagent',
        isGlobal: true,
        role: 'sysop',
        permissions: ['payroll:*', 'finance:read'],
        allowedDomains: ['payroll', 'invoicing'],
        riskProfile: 'high',
        maxAutonomyLevel: 3,
        createdBy,
      },
      {
        agentId: 'subagent-scheduling',
        name: 'Scheduling Subagent',
        description: 'Manages shift scheduling and optimization',
        entityType: 'subagent',
        isGlobal: true,
        role: 'manager',
        permissions: ['scheduling:*', 'employees:read'],
        allowedDomains: ['scheduling'],
        riskProfile: 'low',
        maxAutonomyLevel: 4,
        createdBy,
      },
      {
        agentId: 'subagent-compliance',
        name: 'Compliance Subagent',
        description: 'Monitors and enforces compliance policies',
        entityType: 'subagent',
        isGlobal: true,
        role: 'support_manager',
        permissions: ['compliance:*', 'audit:read'],
        allowedDomains: ['compliance', 'health'],
        riskProfile: 'medium',
        maxAutonomyLevel: 3,
        createdBy,
      },
    ];

    for (const agentReq of defaultAgents) {
      const result = await this.registerAgent(agentReq);
      if (result.success) {
        log.info(`[AgentIdentity] Seeded platform agent: ${agentReq.agentId}`);
      }
    }
  }
}

export const agentIdentityService = AgentIdentityService.getInstance();
