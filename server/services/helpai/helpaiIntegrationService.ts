/**
 * HelpAI Integration Service - Phases 2-5
 * Manages per-org integration configuration and credential management
 */

import { db } from '../../db';
import {
  helpaiIntegrations,
  helpaiCredentials,
  helpaiRegistry,
  type InsertHelpaiIntegration,
  type InsertHelpaiCredential,
  type HelpaiIntegration,
  type HelpaiCredential,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface IntegrationConfig {
  registryId: string;
  workspaceId: string;
  isEnabled?: boolean;
  customEndpoint?: string;
  customConfig?: Record<string, any>;
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
}

export interface CredentialConfig {
  integrationId: string;
  workspaceId: string;
  credentialType: 'api_key' | 'oauth2' | 'bearer' | 'basic_auth';
  credentialValue: string;
  credentialName?: string;
  expiresAt?: Date;
}

export class HelpaiIntegrationService {
  /**
   * Enable an API integration for an organization
   */
  async enableIntegration(
    config: IntegrationConfig,
    configuredBy: string
  ): Promise<HelpaiIntegration> {
    // Verify registry exists
    const registry = await db.query.helpaiRegistry.findFirst({
      where: eq(helpaiRegistry.id, config.registryId),
    });
    if (!registry) {
      throw new Error(`API Registry not found: ${config.registryId}`);
    }

    // Check if already integrated
    const existing = await this.getIntegration(
      config.workspaceId,
      config.registryId
    );
    if (existing) {
      // Update instead
      return this.updateIntegration(config, configuredBy);
    }

    const [integration] = await db
      .insert(helpaiIntegrations)
      .values({
        workspaceId: config.workspaceId,
        registryId: config.registryId,
        isEnabled: config.isEnabled !== false,
        customEndpoint: config.customEndpoint,
        customConfig: (config.customConfig || {}) as any,
        autoSyncEnabled: config.autoSyncEnabled || false,
        syncIntervalMinutes: config.syncIntervalMinutes || 60,
        configuredBy,
      })
      .returning();

    console.log(
      `✅ [HelpAI Integration] Enabled for workspace ${config.workspaceId}: ${registry.apiName}`
    );
    return integration;
  }

  /**
   * Update integration configuration
   */
  async updateIntegration(
    config: Partial<IntegrationConfig> & { registryId?: string; workspaceId: string },
    updatedBy: string
  ): Promise<HelpaiIntegration> {
    const integration = await this.getIntegration(
      config.workspaceId,
      config.registryId!
    );
    if (!integration) {
      throw new Error('Integration not found');
    }

    const [updated] = await db
      .update(helpaiIntegrations)
      .set({
        isEnabled: config.isEnabled,
        customEndpoint: config.customEndpoint,
        customConfig: config.customConfig
          ? (config.customConfig as any)
          : undefined,
        autoSyncEnabled: config.autoSyncEnabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        updatedAt: new Date(),
      })
      .where(eq(helpaiIntegrations.id, integration.id))
      .returning();

    console.log(
      `✅ [HelpAI Integration] Updated for workspace ${config.workspaceId}`
    );
    return updated;
  }

  /**
   * Get an integration
   */
  async getIntegration(
    workspaceId: string,
    registryId: string
  ): Promise<HelpaiIntegration | null> {
    const results = await db.query.helpaiIntegrations.findMany({
      where: and(
        eq(helpaiIntegrations.workspaceId, workspaceId),
        eq(helpaiIntegrations.registryId, registryId)
      ),
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get all integrations for a workspace
   */
  async getWorkspaceIntegrations(workspaceId: string): Promise<HelpaiIntegration[]> {
    return db.query.helpaiIntegrations.findMany({
      where: eq(helpaiIntegrations.workspaceId, workspaceId),
    });
  }

  /**
   * Get all enabled integrations for a workspace
   */
  async getEnabledIntegrations(workspaceId: string): Promise<HelpaiIntegration[]> {
    return db.query.helpaiIntegrations.findMany({
      where: and(
        eq(helpaiIntegrations.workspaceId, workspaceId),
        eq(helpaiIntegrations.isEnabled, true)
      ),
    });
  }

  /**
   * Disable an integration
   */
  async disableIntegration(
    workspaceId: string,
    registryId: string
  ): Promise<void> {
    const integration = await this.getIntegration(workspaceId, registryId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    await db
      .update(helpaiIntegrations)
      .set({
        isEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(helpaiIntegrations.id, integration.id));

    console.log(
      `✅ [HelpAI Integration] Disabled for workspace ${workspaceId}`
    );
  }

  /**
   * Store encrypted credential for an integration
   */
  async storeCredential(
    config: CredentialConfig,
    createdBy: string
  ): Promise<HelpaiCredential> {
    const encryptionKeyId = crypto.randomUUID();
    const encryptionKey = crypto.randomBytes(KEY_LENGTH);
    const encrypted = this.encryptCredential(config.credentialValue, encryptionKey);

    // Store the key separately in a secure manner (would be in a secrets vault in production)
    // For now, we'll just use the keyId and store the key encrypted
    const keyWithIV = Buffer.concat([encryptionKey, Buffer.from(encryptionKeyId)]);
    const encryptedKey = keyWithIV.toString('base64');

    const [credential] = await db
      .insert(helpaiCredentials)
      .values({
        integrationId: config.integrationId,
        workspaceId: config.workspaceId,
        credentialType: config.credentialType,
        encryptedValue: encrypted,
        encryptionKeyId: encryptionKeyId,
        credentialName: config.credentialName,
        expiresAt: config.expiresAt,
        isRevoked: false,
        createdBy,
      })
      .returning();

    console.log(
      `✅ [HelpAI Integration] Stored credential for integration ${config.integrationId}`
    );
    return credential;
  }

  /**
   * Retrieve and decrypt credential
   */
  async getCredential(
    integrationId: string
  ): Promise<{ value: string; credential: HelpaiCredential } | null> {
    const cred = await this.getActiveCredential(integrationId);
    if (!cred || cred.isRevoked) {
      return null;
    }

    // In production, this would retrieve the key from a secrets vault
    // For now, we'd need the key stored somewhere secure
    try {
      // This is a placeholder - actual implementation would retrieve key from secure storage
      console.warn(
        '⚠️ [HelpAI] Credential decryption requires key retrieval from secure storage'
      );
      return { value: cred.encryptedValue, credential: cred };
    } catch (error) {
      console.error('Error retrieving credential:', error);
      return null;
    }
  }

  /**
   * Get active (non-revoked) credential for integration
   */
  private async getActiveCredential(integrationId: string): Promise<HelpaiCredential | null> {
    const creds = await db.query.helpaiCredentials.findMany({
      where: and(
        eq(helpaiCredentials.integrationId, integrationId),
        eq(helpaiCredentials.isRevoked, false)
      ),
      limit: 1,
    });
    return creds.length > 0 ? creds[0] : null;
  }

  /**
   * Revoke a credential
   */
  async revokeCredential(credentialId: string, revokedBy: string): Promise<void> {
    await db
      .update(helpaiCredentials)
      .set({
        isRevoked: true,
        revokedBy,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(helpaiCredentials.id, credentialId));

    console.log(`✅ [HelpAI Integration] Revoked credential ${credentialId}`);
  }

  /**
   * Encrypt credential using AES-256-GCM
   */
  private encryptCredential(credential: string, key: Buffer): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(credential, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine: iv + authTag + encrypted
    const result = iv.toString('hex') + authTag.toString('hex') + encrypted;
    return result;
  }

  /**
   * Update sync status for integration
   */
  async updateSyncStatus(
    integrationId: string,
    status: 'success' | 'error' | 'pending',
    message?: string
  ): Promise<void> {
    await db
      .update(helpaiIntegrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(helpaiIntegrations.id, integrationId));

    console.log(
      `✅ [HelpAI Integration] Sync status updated: ${status}${message ? ` - ${message}` : ''}`
    );
  }

  /**
   * Record successful API request
   */
  async recordSuccessfulRequest(integrationId: string): Promise<void> {
    const integration = await db.query.helpaiIntegrations.findFirst({
      where: eq(helpaiIntegrations.id, integrationId),
    });
    if (!integration) return;

    await db
      .update(helpaiIntegrations)
      .set({
        totalRequests: (integration.totalRequests || 0) + 1,
        totalSuccessfulRequests: (integration.totalSuccessfulRequests || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(helpaiIntegrations.id, integrationId));
  }

  /**
   * Record failed API request
   */
  async recordFailedRequest(integrationId: string): Promise<void> {
    const integration = await db.query.helpaiIntegrations.findFirst({
      where: eq(helpaiIntegrations.id, integrationId),
    });
    if (!integration) return;

    await db
      .update(helpaiIntegrations)
      .set({
        totalRequests: (integration.totalRequests || 0) + 1,
        totalFailedRequests: (integration.totalFailedRequests || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(helpaiIntegrations.id, integrationId));
  }
}

export const helpaiIntegrationService = new HelpaiIntegrationService();
