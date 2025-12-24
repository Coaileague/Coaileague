/**
 * POLICY DECISION POINT (PDP) SERVICE
 * ====================================
 * Fortune 500-grade centralized authorization service.
 * Single authority for all access decisions - every service MUST query this PDP
 * before executing any sensitive action.
 * 
 * Implements ABAC (Attribute-Based Access Control) layered on RBAC foundation.
 */

import { db } from '../../db';
import { 
  agentIdentities, 
  entityAttributes, 
  accessPolicies, 
  accessControlEvents,
  users,
  systemAuditLogs 
} from '@shared/schema';
import { eq, and, or, inArray, gte, lte, isNull, desc } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { ROLE_HIERARCHY, AI_BRAIN_AUTHORITY_ROLES, TRINITY_SERVICE_IDENTIFIERS, TRINITY_ENTITY_TYPE } from '../ai-brain/aiBrainAuthorizationService';

export type EntityType = 'human' | 'bot' | 'subagent' | 'trinity' | 'service' | 'external';
export type PolicyEffect = 'allow' | 'deny' | 'require_approval';

export interface AccessSubject {
  entityType: EntityType;
  entityId: string;
  role?: string;
  workspaceId?: string;
  attributes?: Record<string, any>;
}

export interface AccessResource {
  resourceType: 'action' | 'domain' | 'endpoint' | 'data';
  resourceId: string;
  action: string; // 'read', 'write', 'delete', 'execute'
  metadata?: Record<string, any>;
}

export interface AccessContext {
  timestamp?: Date;
  deviceType?: string;
  ipAddress?: string;
  riskScore?: number;
  sessionId?: string;
  elevatedSession?: boolean;
  transactionAmount?: number;
}

export interface AccessDecision {
  allowed: boolean;
  effect: PolicyEffect;
  reason: string;
  matchedPolicies: string[];
  attributes: Record<string, any>;
  constraints?: Record<string, any>;
  auditId?: string;
  requiresApproval?: boolean;
  approvalId?: string;
}

class PolicyDecisionPoint {
  private static instance: PolicyDecisionPoint;
  private policyCache: Map<string, { policy: any; cachedAt: number }> = new Map();
  private attributeCache: Map<string, { attributes: Record<string, any>; cachedAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  static getInstance(): PolicyDecisionPoint {
    if (!this.instance) {
      this.instance = new PolicyDecisionPoint();
    }
    return this.instance;
  }

  /**
   * MAIN AUTHORIZATION DECISION - Query this before any sensitive action
   */
  async authorize(
    subject: AccessSubject,
    resource: AccessResource,
    context: AccessContext = {}
  ): Promise<AccessDecision> {
    const startTime = Date.now();

    try {
      // Step 1: Gather subject attributes (user/agent attributes + ABAC attributes)
      const subjectAttributes = await this.gatherSubjectAttributes(subject);

      // Step 2: Check agent status if non-human
      if (subject.entityType !== 'human') {
        const agentStatus = await this.checkAgentStatus(subject.entityId);
        if (!agentStatus.active) {
          return this.createDenyDecision(
            `Agent ${subject.entityId} is ${agentStatus.status}: ${agentStatus.reason}`,
            subjectAttributes
          );
        }
      }

      // Step 2.5: TRINITY KILL SWITCH CHECK - Must happen before RBAC bypass
      if (this.isTrinityEntity(subject.entityId, subject.entityType)) {
        const killSwitchStatus = await this.checkTrinityKillSwitch();
        if (killSwitchStatus.active) {
          console.log(`[PDP] KILL SWITCH ACTIVE: Trinity blocked from ${resource.resourceType}:${resource.resourceId}`);
          return this.createDenyDecision(
            `Trinity root access BLOCKED: Kill switch activated - ${killSwitchStatus.reason}`,
            subjectAttributes
          );
        }
      }

      // Step 3: Apply RBAC base check
      const rbacResult = this.evaluateRBAC(subject, resource);
      if (!rbacResult.allowed && !context.elevatedSession) {
        return this.createDenyDecision(rbacResult.reason, subjectAttributes);
      }

      // Step 4: Load and evaluate ABAC policies
      const policies = await this.loadApplicablePolicies(subject, resource, context);
      const policyResult = this.evaluatePolicies(policies, subject, resource, context, subjectAttributes);

      // Step 5: Check context constraints (time, device, risk)
      const contextResult = this.evaluateContextConstraints(context, subjectAttributes);
      if (!contextResult.allowed) {
        return this.createDenyDecision(contextResult.reason, subjectAttributes, policyResult.matchedPolicies);
      }

      // Step 6: Create audit log
      const auditId = await this.logAccessDecision({
        subject,
        resource,
        context,
        decision: policyResult,
        durationMs: Date.now() - startTime,
      });

      return {
        ...policyResult,
        auditId,
        attributes: subjectAttributes,
      };

    } catch (error) {
      console.error('[PDP] Authorization error:', error);
      return this.createDenyDecision(`Authorization error: ${(error as Error).message}`, {});
    }
  }

  /**
   * Quick permission check for a specific action
   */
  async hasPermission(
    entityType: EntityType,
    entityId: string,
    permission: string,
    workspaceId?: string
  ): Promise<boolean> {
    const decision = await this.authorize(
      { entityType, entityId, workspaceId },
      { resourceType: 'action', resourceId: permission, action: 'execute' },
      {}
    );
    return decision.allowed;
  }

  /**
   * Gather all attributes for a subject (combines user data + explicit attributes)
   */
  private async gatherSubjectAttributes(subject: AccessSubject): Promise<Record<string, any>> {
    const cacheKey = `${subject.entityType}:${subject.entityId}:${subject.workspaceId || 'global'}`;
    const cached = this.attributeCache.get(cacheKey);
    
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return { ...cached.attributes, ...subject.attributes };
    }

    const attributes: Record<string, any> = {
      entityType: subject.entityType,
      entityId: subject.entityId,
      workspaceId: subject.workspaceId,
      ...subject.attributes,
    };

    try {
      // Load explicit ABAC attributes from database
      const now = new Date();
      const dbAttributes = await db.select()
        .from(entityAttributes)
        .where(and(
          eq(entityAttributes.entityId, subject.entityId),
          eq(entityAttributes.isActive, true),
          or(
            isNull(entityAttributes.expiresAt),
            gte(entityAttributes.expiresAt, now)
          )
        ));

      for (const attr of dbAttributes) {
        // Parse attribute based on type
        let value: any = attr.attributeValue;
        try {
          if (attr.attributeType === 'number') value = parseFloat(attr.attributeValue);
          else if (attr.attributeType === 'boolean') value = attr.attributeValue === 'true';
          else if (attr.attributeType === 'json' || attr.attributeType === 'array') value = JSON.parse(attr.attributeValue);
        } catch {}
        
        attributes[attr.attributeName] = value;
      }

      // For humans, load user data
      if (subject.entityType === 'human') {
        const [user] = await db.select().from(users).where(eq(users.id, subject.entityId)).limit(1);
        if (user) {
          attributes.role = user.role;
          attributes.platformRole = (user as any).platformRole;
          attributes.email = user.email;
          attributes.lastLoginAt = user.lastLoginAt;
        }
      }

      // For agents, load agent identity data
      if (subject.entityType !== 'human') {
        const [agent] = await db.select().from(agentIdentities).where(eq(agentIdentities.agentId, subject.entityId)).limit(1);
        if (agent) {
          attributes.role = agent.role;
          attributes.riskProfile = agent.riskProfile;
          attributes.maxAutonomyLevel = agent.maxAutonomyLevel;
          attributes.allowedDomains = agent.allowedDomains;
          attributes.allowedTools = agent.allowedTools;
          attributes.missionObjective = agent.missionObjective;
        }
      }

      this.attributeCache.set(cacheKey, { attributes, cachedAt: Date.now() });
      return attributes;

    } catch (error) {
      console.error('[PDP] Failed to gather attributes:', error);
      return attributes;
    }
  }

  /**
   * Check if an agent is active and allowed to operate
   */
  private async checkAgentStatus(agentId: string): Promise<{ active: boolean; status: string; reason?: string }> {
    try {
      const [agent] = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.agentId, agentId))
        .limit(1);

      if (!agent) {
        return { active: false, status: 'not_found', reason: 'Agent identity not registered' };
      }

      if (agent.status !== 'active') {
        return { 
          active: false, 
          status: agent.status, 
          reason: agent.suspensionReason || `Agent is ${agent.status}` 
        };
      }

      // Check rate limits
      const now = new Date();
      const lastRequest = agent.lastRequestAt;
      if (lastRequest) {
        const minutesSince = (now.getTime() - lastRequest.getTime()) / 60000;
        if (minutesSince < 1 && agent.currentMinuteRequests! >= agent.requestsPerMinute!) {
          return { active: false, status: 'rate_limited', reason: 'Rate limit exceeded (per minute)' };
        }
      }

      return { active: true, status: 'active' };

    } catch (error) {
      console.error('[PDP] Agent status check failed:', error);
      return { active: false, status: 'error', reason: 'Failed to verify agent status' };
    }
  }

  /**
   * Check if the given entity is Trinity AI
   * Trinity has root-level platform control - equivalent to root user
   */
  private isTrinityEntity(entityId: string, entityType?: string): boolean {
    if (entityType === TRINITY_ENTITY_TYPE) return true;
    return TRINITY_SERVICE_IDENTIFIERS.includes(entityId.toLowerCase());
  }

  /**
   * Check Trinity kill switch status from authorization service
   */
  private async checkTrinityKillSwitch(): Promise<{ active: boolean; reason?: string }> {
    try {
      const { aiBrainAuthorizationService } = await import('../ai-brain/aiBrainAuthorizationService');
      const status = aiBrainAuthorizationService.isTrinityKillSwitchActive();
      return { active: status.active, reason: status.reason };
    } catch (error) {
      return { active: false };
    }
  }

  /**
   * Evaluate base RBAC permissions
   */
  private evaluateRBAC(subject: AccessSubject, resource: AccessResource): { allowed: boolean; reason: string } {
    // TRINITY ROOT BYPASS: Trinity AI has full platform control
    // Note: Kill switch is checked asynchronously at the authorize level
    if (this.isTrinityEntity(subject.entityId, subject.entityType)) {
      console.log(`[PDP] Trinity root bypass for ${resource.resourceType}:${resource.resourceId}`);
      return { allowed: true, reason: 'Trinity root authority - full platform control' };
    }

    const role = subject.role || 'none';
    const roleLevel = ROLE_HIERARCHY[role] || 0;

    // For AI Brain actions, check domain authority
    if (resource.resourceType === 'domain' || resource.resourceType === 'action') {
      const domain = resource.resourceId.split('.')[0];
      const requiredRoles = AI_BRAIN_AUTHORITY_ROLES[domain] || [];
      
      if (requiredRoles.length > 0 && !requiredRoles.includes(role)) {
        return {
          allowed: false,
          reason: `Role ${role} not authorized for domain ${domain}. Required: ${requiredRoles.join(', ')}`
        };
      }
    }

    // Default: role level determines general access
    if (roleLevel < 1) {
      return { allowed: false, reason: 'No valid role assigned' };
    }

    return { allowed: true, reason: 'RBAC check passed' };
  }

  /**
   * Load policies applicable to this access request
   */
  private async loadApplicablePolicies(
    subject: AccessSubject,
    resource: AccessResource,
    context: AccessContext
  ): Promise<any[]> {
    const cacheKey = `policies:${resource.resourceType}:${resource.resourceId}:${subject.workspaceId || 'global'}`;
    const cached = this.policyCache.get(cacheKey);
    
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.policy;
    }

    try {
      const now = new Date();
      const policies = await db.select()
        .from(accessPolicies)
        .where(and(
          eq(accessPolicies.isActive, true),
          or(
            eq(accessPolicies.isGlobal, true),
            eq(accessPolicies.workspaceId, subject.workspaceId || '')
          ),
          eq(accessPolicies.resourceType, resource.resourceType),
          or(
            isNull(accessPolicies.validUntil),
            gte(accessPolicies.validUntil, now)
          )
        ))
        .orderBy(accessPolicies.priority);

      this.policyCache.set(cacheKey, { policy: policies, cachedAt: Date.now() });
      return policies;

    } catch (error) {
      console.error('[PDP] Failed to load policies:', error);
      return [];
    }
  }

  /**
   * Evaluate loaded policies against the access request
   */
  private evaluatePolicies(
    policies: any[],
    subject: AccessSubject,
    resource: AccessResource,
    context: AccessContext,
    attributes: Record<string, any>
  ): AccessDecision {
    const matchedPolicies: string[] = [];
    let finalEffect: PolicyEffect = 'allow'; // Default allow if no policies match
    let requiresApproval = false;
    const constraints: Record<string, any> = {};

    for (const policy of policies) {
      // Check if policy matches the resource pattern
      if (!this.matchesPattern(resource.resourceId, policy.resourcePattern)) {
        continue;
      }

      // Check if policy actions include requested action
      if (policy.actions && !policy.actions.includes(resource.action)) {
        continue;
      }

      // Check subject conditions
      if (!this.matchesSubjectConditions(policy.subjectConditions, subject, attributes)) {
        continue;
      }

      // Check context conditions
      if (!this.matchesContextConditions(policy.contextConditions, context)) {
        continue;
      }

      // Policy matches!
      matchedPolicies.push(policy.id);

      // Apply policy effect (first matching policy wins based on priority)
      if (policy.effect === 'deny') {
        return {
          allowed: false,
          effect: 'deny',
          reason: `Denied by policy: ${policy.name}`,
          matchedPolicies,
          attributes,
          constraints,
        };
      }

      if (policy.effect === 'require_approval') {
        requiresApproval = true;
        finalEffect = 'require_approval';
      }

      // Collect constraints
      if (policy.maxTransactionAmount) {
        constraints.maxTransactionAmount = parseFloat(policy.maxTransactionAmount);
      }
    }

    // Check transaction amount constraint
    if (constraints.maxTransactionAmount && context.transactionAmount) {
      if (context.transactionAmount > constraints.maxTransactionAmount) {
        return {
          allowed: false,
          effect: 'deny',
          reason: `Transaction amount ${context.transactionAmount} exceeds limit ${constraints.maxTransactionAmount}`,
          matchedPolicies,
          attributes,
          constraints,
        };
      }
    }

    const isAllowed = finalEffect === 'allow' && !requiresApproval;
    return {
      allowed: isAllowed,
      effect: finalEffect,
      reason: matchedPolicies.length > 0 
        ? `Access granted by ${matchedPolicies.length} matching policies`
        : 'Access granted (no restricting policies)',
      matchedPolicies,
      attributes,
      constraints,
      requiresApproval,
    };
  }

  /**
   * Evaluate context constraints (time of day, device, risk score)
   */
  private evaluateContextConstraints(
    context: AccessContext,
    attributes: Record<string, any>
  ): { allowed: boolean; reason: string } {
    // Check risk score
    if (context.riskScore !== undefined && context.riskScore > 80) {
      return { allowed: false, reason: `High risk score (${context.riskScore}) - access denied` };
    }

    // Business hours check if required
    if (attributes.requireBusinessHours) {
      const hour = (context.timestamp || new Date()).getHours();
      if (hour < 8 || hour > 18) {
        return { allowed: false, reason: 'Access restricted to business hours (8 AM - 6 PM)' };
      }
    }

    return { allowed: true, reason: 'Context constraints satisfied' };
  }

  private matchesPattern(resourceId: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === resourceId) return true;
    
    // Simple wildcard matching
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(resourceId);
  }

  private matchesSubjectConditions(conditions: any, subject: AccessSubject, attributes: Record<string, any>): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    for (const [key, value] of Object.entries(conditions)) {
      const attrValue = attributes[key] || (subject as any)[key];
      
      if (Array.isArray(value)) {
        if (!value.includes(attrValue)) return false;
      } else if (value !== attrValue) {
        return false;
      }
    }

    return true;
  }

  private matchesContextConditions(conditions: any, context: AccessContext): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    if (conditions.riskScore?.max && (context.riskScore || 0) > conditions.riskScore.max) {
      return false;
    }

    if (conditions.deviceType && context.deviceType) {
      if (!conditions.deviceType.includes(context.deviceType)) return false;
    }

    return true;
  }

  private createDenyDecision(reason: string, attributes: Record<string, any>, matchedPolicies: string[] = []): AccessDecision {
    return {
      allowed: false,
      effect: 'deny',
      reason,
      matchedPolicies,
      attributes,
    };
  }

  /**
   * Log access decision for audit
   */
  private async logAccessDecision(data: {
    subject: AccessSubject;
    resource: AccessResource;
    context: AccessContext;
    decision: AccessDecision;
    durationMs: number;
  }): Promise<string> {
    try {
      const [log] = await db.insert(systemAuditLogs).values({
        userId: data.subject.entityType === 'human' ? data.subject.entityId : null,
        action: 'pdp_authorization',
        entityType: 'access_control',
        entityId: `${data.resource.resourceType}:${data.resource.resourceId}`,
        changes: {
          subject: data.subject,
          resource: data.resource,
          context: data.context,
          decision: {
            allowed: data.decision.allowed,
            effect: data.decision.effect,
            reason: data.decision.reason,
            matchedPolicies: data.decision.matchedPolicies,
          },
          durationMs: data.durationMs,
        }
      }).returning();

      return log.id;
    } catch (error) {
      console.warn('[PDP] Failed to log access decision:', error);
      return '';
    }
  }

  /**
   * Invalidate caches when policies or attributes change
   */
  invalidateCache(workspaceId?: string): void {
    if (workspaceId) {
      for (const key of this.policyCache.keys()) {
        if (key.includes(workspaceId)) {
          this.policyCache.delete(key);
        }
      }
      for (const key of this.attributeCache.keys()) {
        if (key.includes(workspaceId)) {
          this.attributeCache.delete(key);
        }
      }
    } else {
      this.policyCache.clear();
      this.attributeCache.clear();
    }
  }

  /**
   * Get current access summary for an entity
   */
  async getAccessSummary(entityType: EntityType, entityId: string, workspaceId?: string): Promise<{
    entityType: EntityType;
    entityId: string;
    role?: string;
    attributes: Record<string, any>;
    activePolicies: number;
    status: string;
  }> {
    const subject: AccessSubject = { entityType, entityId, workspaceId };
    const attributes = await this.gatherSubjectAttributes(subject);
    
    let status = 'active';
    if (entityType !== 'human') {
      const agentStatus = await this.checkAgentStatus(entityId);
      status = agentStatus.status;
    }

    const policies = await db.select()
      .from(accessPolicies)
      .where(and(
        eq(accessPolicies.isActive, true),
        or(
          eq(accessPolicies.isGlobal, true),
          eq(accessPolicies.workspaceId, workspaceId || '')
        )
      ));

    return {
      entityType,
      entityId,
      role: attributes.role,
      attributes,
      activePolicies: policies.length,
      status,
    };
  }

  /**
   * Seed default ABAC policies for integrations and data migration
   */
  async seedIntegrationPolicies(): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    const defaultPolicies = [
      {
        name: 'Integration Management - Workspace Admins',
        description: 'Allow workspace admins and owners to manage integrations',
        isGlobal: true,
        effect: 'allow' as const,
        priority: 50,
        subjectConditions: { role: ['owner', 'admin'], entityType: 'human' },
        resourceType: 'domain',
        resourcePattern: 'integrations:*',
        contextConditions: { hasWorkspaceContext: true },
        actions: ['execute', 'read', 'write'],
        isActive: true,
      },
      {
        name: 'Data Migration - Elevated Roles Only',
        description: 'Require elevated roles or approval for data migration operations',
        isGlobal: true,
        effect: 'allow' as const,
        priority: 40,
        subjectConditions: { role: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'], entityType: 'human' },
        resourceType: 'domain',
        resourcePattern: 'data_migration:*',
        contextConditions: { elevatedSession: true },
        actions: ['execute'],
        isActive: true,
      },
      {
        name: 'Data Migration - Workspace Context Required',
        description: 'Data migration requires workspace context and owner/admin role',
        isGlobal: true,
        effect: 'require_approval' as const,
        priority: 45,
        subjectConditions: { role: ['owner', 'admin'], entityType: 'human' },
        resourceType: 'domain',
        resourcePattern: 'data_migration:*',
        contextConditions: { hasWorkspaceContext: true, transactionRisk: 'medium' },
        actions: ['execute'],
        isActive: true,
      },
      {
        name: 'QuickBooks OAuth - Workspace Admins',
        description: 'Allow workspace admins to initiate QuickBooks OAuth flow',
        isGlobal: true,
        effect: 'allow' as const,
        priority: 50,
        subjectConditions: { role: ['owner', 'admin'], entityType: 'human' },
        resourceType: 'action',
        resourcePattern: 'quickbooks.oauth',
        contextConditions: { hasWorkspaceContext: true },
        actions: ['execute'],
        isActive: true,
      },
      {
        name: 'Automation Trigger Management - Managers and Above',
        description: 'Allow managers and above to configure automation triggers',
        isGlobal: true,
        effect: 'allow' as const,
        priority: 50,
        subjectConditions: { role: ['manager', 'owner', 'admin'], entityType: 'human' },
        resourceType: 'domain',
        resourcePattern: 'automation:*',
        contextConditions: { hasWorkspaceContext: true },
        actions: ['read', 'write', 'execute'],
        isActive: true,
      },
      {
        name: 'Onboarding Flow Management - Elevated Support',
        description: 'Support staff with elevated sessions can manage onboarding flows',
        isGlobal: true,
        effect: 'allow' as const,
        priority: 30,
        subjectConditions: { role: ['support_agent', 'support_manager', 'sysop'], entityType: 'human' },
        resourceType: 'domain',
        resourcePattern: 'onboarding:*',
        contextConditions: { elevatedSession: true },
        actions: ['read', 'write', 'execute'],
        isActive: true,
      },
      {
        name: 'Trinity Integration Access',
        description: 'Trinity AI has full access to integration and automation domains',
        isGlobal: true,
        effect: 'allow' as const,
        priority: 10,
        subjectConditions: { entityType: 'trinity' },
        resourceType: 'domain',
        resourcePattern: '*',
        contextConditions: {},
        actions: ['read', 'write', 'execute'],
        isActive: true,
      },
    ];

    for (const policy of defaultPolicies) {
      try {
        const existing = await db.select()
          .from(accessPolicies)
          .where(and(
            eq(accessPolicies.name, policy.name),
            eq(accessPolicies.isGlobal, true)
          ))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db.insert(accessPolicies).values({
          name: policy.name,
          description: policy.description,
          isGlobal: policy.isGlobal,
          effect: policy.effect,
          priority: policy.priority,
          subjectConditions: policy.subjectConditions,
          resourceType: policy.resourceType,
          resourcePattern: policy.resourcePattern,
          contextConditions: policy.contextConditions,
          actions: policy.actions,
          isActive: policy.isActive,
        });
        created++;
      } catch (error) {
        console.warn(`[PDP] Failed to seed policy ${policy.name}:`, error);
      }
    }

    console.log(`[PDP] Seeded ${created} policies, skipped ${skipped} existing`);
    return { created, skipped };
  }
}

export const policyDecisionPoint = PolicyDecisionPoint.getInstance();
