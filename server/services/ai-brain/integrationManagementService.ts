import { db } from '../../db';
import { 
  integrationMarketplace, 
  integrationConnections, 
  integrationApiKeys,
  systemAuditLogs,
  InsertIntegrationConnection,
  InsertIntegrationApiKey,
  IntegrationMarketplace,
  IntegrationConnection,
  IntegrationApiKey
} from '@shared/schema';
import { eq, and, desc, sql, isNull, or, inArray, gte, lte, count } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('integrationManagementService');

export type IntegrationAccessLevel = 'owner' | 'admin' | 'manager' | 'viewer';

export interface IntegrationAccessContext {
  userId: string;
  workspaceId: string;
  platformRole: string;
  workspaceRole: string;
  accessLevel: IntegrationAccessLevel;
}

export interface IntegrationConnectionRequest {
  integrationId: string;
  displayName: string;
  authType: 'oauth2' | 'api_key' | 'basic' | 'webhook';
  credentials: {
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
    refreshToken?: string;
    webhookSecret?: string;
    additionalConfig?: Record<string, unknown>;
  };
  syncConfig?: {
    syncFrequencyMinutes?: number;
    syncDirection?: 'pull' | 'push' | 'bidirectional';
    dataTypes?: string[];
  };
}

export interface ServiceHealthStatus {
  integrationId: string;
  integrationName: string;
  isHealthy: boolean;
  lastChecked: Date;
  errorMessage?: string;
  recoveryAction?: string;
  estimatedRecoveryTime?: string;
  alternativeAction?: string;
}

class IntegrationManagementService {
  private static instance: IntegrationManagementService;
  private healthCache: Map<string, ServiceHealthStatus> = new Map();

  private constructor() {
    log.info('[IntegrationManagement] Service initialized');
  }

  static getInstance(): IntegrationManagementService {
    if (!this.instance) {
      this.instance = new IntegrationManagementService();
    }
    return this.instance;
  }

  determineAccessLevel(platformRole: string, workspaceRole: string): IntegrationAccessLevel {
    const ownerRoles = ['root_admin', 'deputy_admin', 'sysop'];
    const adminRoles = ['org_owner', 'co_owner', 'org_admin'];
    const managerRoles = ['org_manager', 'manager', 'department_manager'];
    
    if (ownerRoles.includes(platformRole)) return 'owner';
    if (adminRoles.includes(workspaceRole) || adminRoles.includes(platformRole)) return 'admin';
    if (managerRoles.includes(workspaceRole)) return 'manager';
    return 'viewer';
  }

  canManageIntegrations(accessLevel: IntegrationAccessLevel): boolean {
    return ['owner', 'admin'].includes(accessLevel);
  }

  canViewIntegrations(accessLevel: IntegrationAccessLevel): boolean {
    return ['owner', 'admin', 'manager', 'viewer'].includes(accessLevel);
  }

  canCreateApiKeys(accessLevel: IntegrationAccessLevel): boolean {
    return ['owner', 'admin'].includes(accessLevel);
  }

  canDeleteApiKeys(accessLevel: IntegrationAccessLevel): boolean {
    return ['owner', 'admin'].includes(accessLevel);
  }

  async listAvailableIntegrations(context: IntegrationAccessContext): Promise<IntegrationMarketplace[]> {
    if (!this.canViewIntegrations(context.accessLevel)) {
      throw new Error('Insufficient permissions to view integrations');
    }

    const integrations = await db.select()
      .from(integrationMarketplace)
      .where(eq(integrationMarketplace.isActive, true))
      .orderBy(desc(integrationMarketplace.installCount));

    await this.logAudit(context.userId, context.workspaceId, 'list_available_integrations', {
      count: integrations.length
    });

    return integrations;
  }

  async getWorkspaceConnections(context: IntegrationAccessContext): Promise<(IntegrationConnection & { integration?: IntegrationMarketplace })[]> {
    if (!this.canViewIntegrations(context.accessLevel)) {
      throw new Error('Insufficient permissions to view workspace connections');
    }

    const connections = await db.select()
      .from(integrationConnections)
      .leftJoin(integrationMarketplace, eq(integrationConnections.integrationId, integrationMarketplace.id))
      .where(eq(integrationConnections.workspaceId, context.workspaceId));

    return connections.map(c => ({
      ...c.integration_connections,
      integration: c.integration_marketplace || undefined
    }));
  }

  async connectIntegration(
    context: IntegrationAccessContext,
    request: IntegrationConnectionRequest
  ): Promise<{ success: boolean; connection?: IntegrationConnection; error?: string }> {
    if (!this.canManageIntegrations(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to connect integrations' };
    }

    try {
      const integration = await db.select()
        .from(integrationMarketplace)
        .where(eq(integrationMarketplace.id, request.integrationId))
        .limit(1);

      if (integration.length === 0) {
        return { success: false, error: 'Integration not found in marketplace' };
      }

      if (!integration[0].isActive) {
        return { success: false, error: 'Integration is currently suspended' };
      }

      const existing = await db.select()
        .from(integrationConnections)
        .where(and(
          eq(integrationConnections.workspaceId, context.workspaceId),
          eq(integrationConnections.integrationId, request.integrationId)
        ))
        .limit(1);

      if (existing.length > 0) {
        return { success: false, error: 'Integration already connected to this workspace' };
      }

      const encryptedCredentials = this.encryptCredentials(request.credentials);

      const [connection] = await db.insert(integrationConnections).values({
        workspaceId: context.workspaceId,
        integrationId: request.integrationId,
        connectionName: request.displayName,
        authType: request.authType,
        apiKey: request.credentials.apiKey ? this.encryptValue(request.credentials.apiKey) : null,
        accessToken: request.credentials.accessToken ? this.encryptValue(request.credentials.accessToken) : null,
        refreshToken: request.credentials.refreshToken ? this.encryptValue(request.credentials.refreshToken) : null,
        syncConfig: request.syncConfig || {},
        connectedByUserId: context.userId,
        isActive: true,
        isHealthy: true,
      }).returning();

      await db.update(integrationMarketplace)
        .set({ installCount: sql`${integrationMarketplace.installCount} + 1` })
        .where(eq(integrationMarketplace.id, request.integrationId));

      await this.logAudit(context.userId, context.workspaceId, 'connect_integration', {
        integrationId: request.integrationId,
        integrationName: integration[0].name,
        connectionId: connection.id
      });

      platformEventBus.publish({
        type: 'integration_connected',
        category: 'feature',
        title: 'Integration Connected',
        description: `${integration[0].name} connected to workspace`,
        workspaceId: context.workspaceId,
        userId: context.userId,
        metadata: {
          integrationId: request.integrationId,
          integrationName: integration[0].name,
          connectionId: connection.id
        }
      }).catch((err) => log.warn('[integrationManagementService] Fire-and-forget failed:', err));

      return { success: true, connection };
    } catch (error) {
      log.error('[IntegrationManagement] Connect integration error:', error);
      return { success: false, error: 'Failed to connect integration' };
    }
  }

  async disconnectIntegration(
    context: IntegrationAccessContext,
    connectionId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canManageIntegrations(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to disconnect integrations' };
    }

    try {
      const connection = await db.select()
        .from(integrationConnections)
        .leftJoin(integrationMarketplace, eq(integrationConnections.integrationId, integrationMarketplace.id))
        .where(and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.workspaceId, context.workspaceId)
        ))
        .limit(1);

      if (connection.length === 0) {
        return { success: false, error: 'Connection not found' };
      }

      await db.delete(integrationConnections)
        .where(eq(integrationConnections.id, connectionId));

      const integrationId = connection[0].integration_connections.integrationId;
      await db.update(integrationMarketplace)
        .set({ installCount: sql`GREATEST(${integrationMarketplace.installCount} - 1, 0)` })
        .where(eq(integrationMarketplace.id, integrationId));

      await this.logAudit(context.userId, context.workspaceId, 'disconnect_integration', {
        connectionId,
        integrationId,
        integrationName: connection[0].integration_marketplace?.name
      });

      platformEventBus.publish({
        type: 'integration_disconnected',
        category: 'feature',
        title: 'Integration Disconnected',
        description: `${connection[0].integration_marketplace?.name || 'Integration'} disconnected from workspace`,
        workspaceId: context.workspaceId,
        userId: context.userId,
        metadata: { connectionId, integrationId }
      }).catch((err) => log.warn('[integrationManagementService] Fire-and-forget failed:', err));

      return { success: true };
    } catch (error) {
      log.error('[IntegrationManagement] Disconnect integration error:', error);
      return { success: false, error: 'Failed to disconnect integration' };
    }
  }

  async updateConnectionCredentials(
    context: IntegrationAccessContext,
    connectionId: string,
    credentials: IntegrationConnectionRequest['credentials']
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canManageIntegrations(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to update credentials' };
    }

    try {
      const connection = await db.select()
        .from(integrationConnections)
        .where(and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.workspaceId, context.workspaceId)
        ))
        .limit(1);

      if (connection.length === 0) {
        return { success: false, error: 'Connection not found' };
      }

      const encryptedCredentials = this.encryptCredentials(credentials);

      await db.update(integrationConnections)
        .set({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          encryptedCredentials,
          apiKey: credentials.apiKey ? this.encryptValue(credentials.apiKey) : null,
          accessToken: credentials.accessToken ? this.encryptValue(credentials.accessToken) : null,
          refreshToken: credentials.refreshToken ? this.encryptValue(credentials.refreshToken) : null,
          updatedAt: new Date()
        })
        .where(eq(integrationConnections.id, connectionId));

      await this.logAudit(context.userId, context.workspaceId, 'update_credentials', {
        connectionId,
        credentialsUpdated: true
      });

      return { success: true };
    } catch (error) {
      log.error('[IntegrationManagement] Update credentials error:', error);
      return { success: false, error: 'Failed to update credentials' };
    }
  }

  async createApiKey(
    context: IntegrationAccessContext,
    name: string,
    scopes: string[],
    expiresAt?: Date
  ): Promise<{ success: boolean; apiKey?: string; keyId?: string; error?: string }> {
    if (!this.canCreateApiKeys(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to create API keys' };
    }

    try {
      const rawKey = `colk_${crypto.randomBytes(32).toString('hex')}`;
      const keyPrefix = rawKey.substring(0, 12);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      const [apiKeyRecord] = await db.insert(integrationApiKeys).values({
        workspaceId: context.workspaceId,
        name,
        keyPrefix,
        keyHash,
        scopes,
        createdByUserId: context.userId,
        expiresAt,
        isActive: true
      }).returning();

      await this.logAudit(context.userId, context.workspaceId, 'create_api_key', {
        keyId: apiKeyRecord.id,
        keyName: name,
        scopes,
        expiresAt
      });

      platformEventBus.publish({
        type: 'api_key_created',
        category: 'security',
        title: 'API Key Created',
        description: `New API key "${name}" created`,
        workspaceId: context.workspaceId,
        userId: context.userId,
        metadata: { keyId: apiKeyRecord.id, keyName: name, scopes }
      }).catch((err) => log.warn('[integrationManagementService] Fire-and-forget failed:', err));

      return { success: true, apiKey: rawKey, keyId: apiKeyRecord.id };
    } catch (error) {
      log.error('[IntegrationManagement] Create API key error:', error);
      return { success: false, error: 'Failed to create API key' };
    }
  }

  async listApiKeys(context: IntegrationAccessContext): Promise<IntegrationApiKey[]> {
    if (!this.canViewIntegrations(context.accessLevel)) {
      throw new Error('Insufficient permissions to view API keys');
    }

    return db.select()
      .from(integrationApiKeys)
      .where(eq(integrationApiKeys.workspaceId, context.workspaceId))
      .orderBy(desc(integrationApiKeys.createdAt));
  }

  async revokeApiKey(
    context: IntegrationAccessContext,
    keyId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canDeleteApiKeys(context.accessLevel)) {
      return { success: false, error: 'Insufficient permissions to revoke API keys' };
    }

    try {
      const key = await db.select()
        .from(integrationApiKeys)
        .where(and(
          eq(integrationApiKeys.id, keyId),
          eq(integrationApiKeys.workspaceId, context.workspaceId)
        ))
        .limit(1);

      if (key.length === 0) {
        return { success: false, error: 'API key not found' };
      }

      await db.update(integrationApiKeys)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(integrationApiKeys.id, keyId));

      await this.logAudit(context.userId, context.workspaceId, 'revoke_api_key', {
        keyId,
        keyName: key[0].name
      });

      platformEventBus.publish({
        type: 'api_key_revoked',
        category: 'security',
        title: 'API Key Revoked',
        description: `API key "${key[0].name}" has been revoked`,
        workspaceId: context.workspaceId,
        userId: context.userId,
        metadata: { keyId, keyName: key[0].name }
      }).catch((err) => log.warn('[integrationManagementService] Fire-and-forget failed:', err));

      return { success: true };
    } catch (error) {
      log.error('[IntegrationManagement] Revoke API key error:', error);
      return { success: false, error: 'Failed to revoke API key' };
    }
  }

  async getServiceHealth(context: IntegrationAccessContext): Promise<ServiceHealthStatus[]> {
    const connections = await this.getWorkspaceConnections(context);
    const healthStatuses: ServiceHealthStatus[] = [];

    for (const conn of connections) {
      const cached = this.healthCache.get(conn.id);
      if (cached && Date.now() - cached.lastChecked.getTime() < 60000) {
        healthStatuses.push(cached);
        continue;
      }

      const status: ServiceHealthStatus = {
        integrationId: conn.integrationId,
        integrationName: conn.integration?.name || (conn as any).displayName,
        isHealthy: conn.isHealthy || false,
        lastChecked: new Date(),
        errorMessage: conn.isHealthy ? undefined : 'Service connectivity issue detected',
        recoveryAction: conn.isHealthy ? undefined : 'Check API key validity and service status',
        estimatedRecoveryTime: conn.isHealthy ? undefined : 'Unknown - awaiting service response',
        alternativeAction: conn.isHealthy ? undefined : 'Contact support or use manual data entry'
      };

      this.healthCache.set(conn.id, status);
      healthStatuses.push(status);
    }

    return healthStatuses;
  }

  async analyzeServiceOutage(
    context: IntegrationAccessContext,
    integrationId: string
  ): Promise<{
    diagnosis: string;
    userGuidance: string;
    alternativeActions: string[];
    estimatedImpact: string;
    supportRecommendation: string;
  }> {
    const connections = await db.select()
      .from(integrationConnections)
      .leftJoin(integrationMarketplace, eq(integrationConnections.integrationId, integrationMarketplace.id))
      .where(and(
        eq(integrationConnections.workspaceId, context.workspaceId),
        eq(integrationConnections.integrationId, integrationId)
      ))
      .limit(1);

    if (connections.length === 0) {
      return {
        diagnosis: 'Integration not found or not connected',
        userGuidance: 'Please connect the integration first from Settings > Integrations',
        alternativeActions: ['Connect the integration', 'Contact support for assistance'],
        estimatedImpact: 'Unable to sync data with external service',
        supportRecommendation: 'If you need help, contact support with your workspace ID'
      };
    }

    const conn = connections[0];
    const isHealthy = conn.integration_connections.isHealthy;
    const lastError = conn.integration_connections.lastSyncError;

    if (isHealthy) {
      return {
        diagnosis: 'Integration is operating normally',
        userGuidance: 'No issues detected. Data sync is working as expected.',
        alternativeActions: [],
        estimatedImpact: 'None',
        supportRecommendation: 'No action needed'
      };
    }

    return {
      diagnosis: lastError || 'Service connectivity issue detected',
      userGuidance: `The ${conn.integration_marketplace?.name || 'integration'} service is currently experiencing issues. Your data is safe and will sync when service resumes.`,
      alternativeActions: [
        'Manually enter critical data for now',
        'Check the service provider status page',
        'Update API credentials if recently changed',
        'Contact support for expedited assistance'
      ],
      estimatedImpact: 'Data synchronization paused until service recovers',
      supportRecommendation: 'If this persists for more than 1 hour, please contact support'
    };
  }

  private encryptCredentials(credentials: Record<string, unknown>): string {
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET environment variable is required for encryption');
    }
    const key = process.env.SESSION_SECRET;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.padEnd(32, '0').slice(0, 32)), iv);
    
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private encryptValue(value: string): string {
    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET environment variable is required for encryption');
    }
    const key = process.env.SESSION_SECRET;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.padEnd(32, '0').slice(0, 32)), iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private async logAudit(
    userId: string,
    workspaceId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        action: `integration.${action}`,
        entityType: 'integration',
        entityId: details.integrationId as string || details.connectionId as string || details.keyId as string || 'system',
        details,
        metadata: { severity: action.includes('delete') || action.includes('revoke') ? 'warning' : 'info', category: 'security' },
      });
    } catch (error) {
      log.error('[IntegrationManagement] Audit log error:', error);
    }
  }
}

export const integrationManagementService = IntegrationManagementService.getInstance();
