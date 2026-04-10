import { db } from '../../db';
import { 
  integrationMarketplace, 
  integrationConnections,
  systemAuditLogs,
  InsertIntegrationMarketplace,
  IntegrationMarketplace
} from '@shared/schema';
import { eq, and, desc, sql, like, or, count, ilike } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('integrationPartnerService');

export type SupportAccessLevel = 'root' | 'coo' | 'cto' | 'support_lead' | 'support_agent' | 'viewer';

export interface SupportContext {
  userId: string;
  platformRole: string;
  accessLevel: SupportAccessLevel;
}

export interface PartnerCreateRequest {
  name: string;
  slug: string;
  category: 'payroll' | 'hr' | 'accounting' | 'crm' | 'communication' | 'storage' | 'analytics' | 'ai' | 'custom';
  description: string;
  shortDescription?: string;
  logoUrl?: string;
  websiteUrl?: string;
  documentationUrl?: string;
  authConfig: {
    type: 'oauth2' | 'api_key' | 'basic' | 'webhook';
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    apiKeyName?: string;
  };
  capabilities?: string[];
  supportedDataTypes?: string[];
  pricingTier?: 'free' | 'basic' | 'premium' | 'enterprise';
  developerEmail?: string;
  developerName?: string;
}

export interface PartnerStatus {
  partnerId: string;
  name: string;
  status: 'active' | 'suspended' | 'pending_review' | 'deprecated';
  activeConnections: number;
  lastUpdated: Date;
  suspensionReason?: string;
}

class IntegrationPartnerService {
  private static instance: IntegrationPartnerService;

  private constructor() {
    log.info('[IntegrationPartner] Service initialized');
  }

  static getInstance(): IntegrationPartnerService {
    if (!this.instance) {
      this.instance = new IntegrationPartnerService();
    }
    return this.instance;
  }

  determineSupportAccessLevel(platformRole: string): SupportAccessLevel {
    const roleMapping: Record<string, SupportAccessLevel> = {
      'root_admin': 'root',
      'deputy_admin': 'coo',
      'sysop': 'cto',
      'support_manager': 'support_lead',
      'support_agent': 'support_agent'
    };
    return roleMapping[platformRole] || 'viewer';
  }

  canManagePartners(accessLevel: SupportAccessLevel): boolean {
    return ['root', 'coo', 'cto', 'support_lead'].includes(accessLevel);
  }

  canSuspendPartners(accessLevel: SupportAccessLevel): boolean {
    return ['root', 'coo', 'cto', 'support_lead'].includes(accessLevel);
  }

  canDeletePartners(accessLevel: SupportAccessLevel): boolean {
    return ['root', 'coo', 'cto'].includes(accessLevel);
  }

  canViewPartners(accessLevel: SupportAccessLevel): boolean {
    return ['root', 'coo', 'cto', 'support_lead', 'support_agent'].includes(accessLevel);
  }

  async listAllPartners(context: SupportContext, options?: {
    category?: string;
    status?: 'active' | 'suspended' | 'all';
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ partners: IntegrationMarketplace[]; total: number }> {
    let query = db.select().from(integrationMarketplace);
    let countQuery = db.select({ count: count() }).from(integrationMarketplace);

    const conditions = [];

    if (options?.category) {
      conditions.push(eq(integrationMarketplace.category, options.category as any));
    }

    if (options?.status === 'active') {
      conditions.push(eq(integrationMarketplace.isActive, true));
    } else if (options?.status === 'suspended') {
      conditions.push(eq(integrationMarketplace.isActive, false));
    }

    if (options?.search) {
      conditions.push(or(
        ilike(integrationMarketplace.name, `%${options.search}%`),
        ilike(integrationMarketplace.description, `%${options.search}%`)
      ));
    }

    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause as any) as any;
      countQuery = countQuery.where(whereClause as any) as any;
    }

    const [totalResult] = await countQuery;
    const partners = await query
      .orderBy(desc(integrationMarketplace.installCount))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    return {
      partners,
      total: Number(totalResult?.count || 0)
    };
  }

  async getPartnerDetails(context: SupportContext, partnerId: string): Promise<PartnerStatus | null> {
    const partner = await db.select()
      .from(integrationMarketplace)
      .where(eq(integrationMarketplace.id, partnerId))
      .limit(1);

    if (partner.length === 0) return null;

    const [connectionCount] = await db.select({ count: count() })
      .from(integrationConnections)
      .where(eq(integrationConnections.integrationId, partnerId));

    return {
      partnerId: partner[0].id,
      name: partner[0].name,
      status: partner[0].isActive ? 'active' : 'suspended',
      activeConnections: Number(connectionCount?.count || 0),
      lastUpdated: partner[0].updatedAt || partner[0].createdAt || new Date(),
      suspensionReason: partner[0].isActive ? undefined : 'Suspended by platform administrator'
    };
  }

  async createPartner(
    context: SupportContext,
    request: PartnerCreateRequest
  ): Promise<{ success: boolean; partner?: IntegrationMarketplace; error?: string }> {
    if (!this.canManagePartners(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to create partners' };
    }

    try {
      const existing = await db.select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.slug, request.slug))
        .limit(1);

      if (existing.length > 0) {
        return { success: false, error: 'A partner with this slug already exists' };
      }

      // @ts-expect-error — TS migration: fix in refactoring sprint
      const [partner] = await db.insert(integrationMarketplace).values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        name: request.name,
        slug: request.slug,
        category: request.category,
        description: request.shortDescription ? `${request.description}\n\n${request.shortDescription}` : request.description,
        logoUrl: request.logoUrl,
        websiteUrl: request.websiteUrl,
        documentationUrl: request.documentationUrl,
        authConfig: request.authConfig,
        supportedFeatures: request.capabilities || [],
        developerEmail: request.developerEmail,
        isActive: true,
        isCertified: ['root', 'coo', 'cto'].includes(context.accessLevel),
        installCount: 0
      }).returning();

      await this.logAudit(context.userId, 'create_partner', {
        partnerId: partner.id,
        partnerName: request.name,
        category: request.category
      });

      platformEventBus.publish({
        type: 'partner_created',
        category: 'feature',
        title: 'Integration Partner Added',
        description: `New integration partner "${request.name}" added to marketplace`,
        userId: context.userId,
        metadata: {
          partnerId: partner.id,
          partnerName: request.name,
          category: request.category
        }
      }).catch((err) => log.warn('[integrationPartnerService] Fire-and-forget failed:', err));

      return { success: true, partner };
    } catch (error) {
      log.error('[IntegrationPartner] Create partner error:', error);
      return { success: false, error: 'Failed to create partner' };
    }
  }

  async updatePartner(
    context: SupportContext,
    partnerId: string,
    updates: Partial<PartnerCreateRequest>
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canManagePartners(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to update partners' };
    }

    try {
      const partner = await db.select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, partnerId))
        .limit(1);

      if (partner.length === 0) {
        return { success: false, error: 'Partner not found' };
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      if (updates.name) updateData.name = updates.name;
      if (updates.description) updateData.description = updates.description;
      if (updates.logoUrl) updateData.logoUrl = updates.logoUrl;
      if (updates.websiteUrl) updateData.websiteUrl = updates.websiteUrl;
      if (updates.documentationUrl) updateData.documentationUrl = updates.documentationUrl;
      if (updates.authConfig) updateData.authConfig = updates.authConfig;
      if (updates.capabilities) updateData.supportedFeatures = updates.capabilities;
      if (updates.developerEmail) updateData.developerEmail = updates.developerEmail;

      await db.update(integrationMarketplace)
        .set(updateData as any)
        .where(eq(integrationMarketplace.id, partnerId));

      await this.logAudit(context.userId, 'update_partner', {
        partnerId,
        partnerName: partner[0].name,
        updatedFields: Object.keys(updates)
      });

      return { success: true };
    } catch (error) {
      log.error('[IntegrationPartner] Update partner error:', error);
      return { success: false, error: 'Failed to update partner' };
    }
  }

  async suspendPartner(
    context: SupportContext,
    partnerId: string,
    reason: string
  ): Promise<{ success: boolean; affectedWorkspaces: number; error?: string }> {
    if (!this.canSuspendPartners(context.accessLevel)) {
      return { success: false, affectedWorkspaces: 0, error: 'Insufficient permissions to suspend partners' };
    }

    try {
      const partner = await db.select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, partnerId))
        .limit(1);

      if (partner.length === 0) {
        return { success: false, affectedWorkspaces: 0, error: 'Partner not found' };
      }

      const connections = await db.select()
        .from(integrationConnections)
        .where(eq(integrationConnections.integrationId, partnerId));

      await db.update(integrationMarketplace)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(eq(integrationMarketplace.id, partnerId));

      await db.update(integrationConnections)
        .set({
          isHealthy: false,
          lastSyncError: `Service suspended: ${reason}`,
          updatedAt: new Date()
        })
        .where(eq(integrationConnections.integrationId, partnerId));

      await this.logAudit(context.userId, 'suspend_partner', {
        partnerId,
        partnerName: partner[0].name,
        reason,
        affectedConnections: connections.length
      });

      platformEventBus.publish({
        type: 'partner_suspended',
        category: 'warning',
        title: 'Integration Partner Suspended',
        description: `Integration partner "${partner[0].name}" has been suspended: ${reason}`,
        userId: context.userId,
        metadata: {
          partnerId,
          partnerName: partner[0].name,
          reason,
          affectedWorkspaces: connections.length
        }
      }).catch((err) => log.warn('[integrationPartnerService] Fire-and-forget failed:', err));

      const uniqueWorkspaces = new Set(connections.map(c => c.workspaceId));

      return { success: true, affectedWorkspaces: uniqueWorkspaces.size };
    } catch (error) {
      log.error('[IntegrationPartner] Suspend partner error:', error);
      return { success: false, affectedWorkspaces: 0, error: 'Failed to suspend partner' };
    }
  }

  async reactivatePartner(
    context: SupportContext,
    partnerId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canSuspendPartners(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to reactivate partners' };
    }

    try {
      const partner = await db.select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, partnerId))
        .limit(1);

      if (partner.length === 0) {
        return { success: false, error: 'Partner not found' };
      }

      await db.update(integrationMarketplace)
        .set({
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(integrationMarketplace.id, partnerId));

      await db.update(integrationConnections)
        .set({
          isHealthy: true,
          lastSyncError: null,
          updatedAt: new Date()
        })
        .where(eq(integrationConnections.integrationId, partnerId));

      await this.logAudit(context.userId, 'reactivate_partner', {
        partnerId,
        partnerName: partner[0].name
      });

      platformEventBus.publish({
        type: 'partner_reactivated',
        category: 'feature',
        title: 'Integration Partner Reactivated',
        description: `Integration partner "${partner[0].name}" has been reactivated`,
        userId: context.userId,
        metadata: { partnerId, partnerName: partner[0].name }
      }).catch((err) => log.warn('[integrationPartnerService] Fire-and-forget failed:', err));

      return { success: true };
    } catch (error) {
      log.error('[IntegrationPartner] Reactivate partner error:', error);
      return { success: false, error: 'Failed to reactivate partner' };
    }
  }

  async deletePartner(
    context: SupportContext,
    partnerId: string,
    force: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canDeletePartners(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to delete partners' };
    }

    try {
      const partner = await db.select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, partnerId))
        .limit(1);

      if (partner.length === 0) {
        return { success: false, error: 'Partner not found' };
      }

      const [connectionCount] = await db.select({ count: count() })
        .from(integrationConnections)
        .where(eq(integrationConnections.integrationId, partnerId));

      if (Number(connectionCount?.count || 0) > 0 && !force) {
        return {
          success: false,
          error: `Partner has ${connectionCount.count} active connections. Use force=true to delete anyway.`
        };
      }

      if (force) {
        await db.delete(integrationConnections)
          .where(eq(integrationConnections.integrationId, partnerId));
      }

      await db.delete(integrationMarketplace)
        .where(eq(integrationMarketplace.id, partnerId));

      await this.logAudit(context.userId, 'delete_partner', {
        partnerId,
        partnerName: partner[0].name,
        forced: force,
        deletedConnections: Number(connectionCount?.count || 0)
      });

      platformEventBus.publish({
        type: 'partner_deleted',
        category: 'warning',
        title: 'Integration Partner Deleted',
        description: `Integration partner "${partner[0].name}" has been permanently deleted`,
        userId: context.userId,
        metadata: { partnerId, partnerName: partner[0].name, forced: force }
      }).catch((err) => log.warn('[integrationPartnerService] Fire-and-forget failed:', err));

      return { success: true };
    } catch (error) {
      log.error('[IntegrationPartner] Delete partner error:', error);
      return { success: false, error: 'Failed to delete partner' };
    }
  }

  async getPartnerUsageStats(context: SupportContext, partnerId?: string): Promise<{
    totalPartners: number;
    activePartners: number;
    suspendedPartners: number;
    totalConnections: number;
    topPartners: { name: string; connections: number }[];
  }> {
    const [totalResult] = await db.select({ count: count() }).from(integrationMarketplace);
    const [activeResult] = await db.select({ count: count() })
      .from(integrationMarketplace)
      .where(eq(integrationMarketplace.isActive, true));
    const [suspendedResult] = await db.select({ count: count() })
      .from(integrationMarketplace)
      .where(eq(integrationMarketplace.isActive, false));
    const [connectionsResult] = await db.select({ count: count() }).from(integrationConnections);

    const topPartners = await db.select({
      name: integrationMarketplace.name,
      connections: integrationMarketplace.installCount
    })
      .from(integrationMarketplace)
      .orderBy(desc(integrationMarketplace.installCount))
      .limit(10);

    return {
      totalPartners: Number(totalResult?.count || 0),
      activePartners: Number(activeResult?.count || 0),
      suspendedPartners: Number(suspendedResult?.count || 0),
      totalConnections: Number(connectionsResult?.count || 0),
      topPartners: topPartners.map(p => ({ name: p.name, connections: p.connections || 0 }))
    };
  }

  private async logAudit(
    userId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        action: `partner.${action}`,
        entityType: 'integration_partner',
        entityId: details.partnerId as string || 'system',
        details,
        metadata: { severity: action.includes('delete') || action.includes('suspend') ? 'warning' : 'info', category: 'security' },
      });
    } catch (error) {
      log.error('[IntegrationPartner] Audit log error:', error);
    }
  }
}

export const integrationPartnerService = IntegrationPartnerService.getInstance();
