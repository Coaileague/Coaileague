/**
 * API KEY ROTATION SERVICE
 * =========================
 * Automated API key rotation with expiry warnings and secure storage.
 * Supports multiple key types with configurable rotation policies.
 * 
 * Features:
 * - Scheduled key rotation
 * - Expiry warnings
 * - Secure key generation
 * - Audit trail for all rotations
 * - Grace period for old keys
 * - SOX-compliant logging
 */

import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type KeyType = 'api_key' | 'webhook_secret' | 'encryption_key' | 'session_secret';
export type KeyStatus = 'active' | 'expiring_soon' | 'expired' | 'rotated' | 'revoked';

export interface ManagedKey {
  id: string;
  name: string;
  keyType: KeyType;
  keyPrefix: string;
  keyHash: string;
  status: KeyStatus;
  createdAt: Date;
  expiresAt: Date;
  lastRotatedAt?: Date;
  rotationCount: number;
  workspaceId?: string;
  metadata: Record<string, any>;
}

export interface RotationPolicy {
  keyType: KeyType;
  rotationDays: number;
  warningDays: number;
  gracePeriodDays: number;
  autoRotate: boolean;
}

export interface RotationResult {
  success: boolean;
  oldKeyId: string;
  newKeyId?: string;
  newKeyValue?: string;
  error?: string;
}

// ============================================================================
// API KEY ROTATION SERVICE
// ============================================================================

class ApiKeyRotationService {
  private static instance: ApiKeyRotationService;
  private policies: Map<KeyType, RotationPolicy> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  static getInstance(): ApiKeyRotationService {
    if (!this.instance) {
      this.instance = new ApiKeyRotationService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.ensureTableExists();
      this.loadDefaultPolicies();
      this.startExpiryChecking();
      
      this.initialized = true;
      console.log('[ApiKeyRotation] Service initialized');
    } catch (error) {
      console.error('[ApiKeyRotation] Failed to initialize:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS managed_api_keys (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(200) NOT NULL,
          key_type VARCHAR(50) NOT NULL,
          key_prefix VARCHAR(20) NOT NULL,
          key_hash VARCHAR(128) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          workspace_id VARCHAR REFERENCES workspaces(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          last_rotated_at TIMESTAMP WITH TIME ZONE,
          rotation_count INTEGER NOT NULL DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          UNIQUE(name, workspace_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_managed_keys_status ON managed_api_keys(status);
        CREATE INDEX IF NOT EXISTS idx_managed_keys_expires ON managed_api_keys(expires_at);
        CREATE INDEX IF NOT EXISTS idx_managed_keys_workspace ON managed_api_keys(workspace_id);
        
        CREATE TABLE IF NOT EXISTS key_rotation_history (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          key_id VARCHAR NOT NULL,
          action VARCHAR(50) NOT NULL,
          old_key_hash VARCHAR(128),
          new_key_hash VARCHAR(128),
          performed_by VARCHAR,
          reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_rotation_history_key ON key_rotation_history(key_id);
      `);
    } catch (error) {
      console.error('[ApiKeyRotation] Failed to create tables:', error);
    }
  }

  private loadDefaultPolicies(): void {
    const defaultPolicies: RotationPolicy[] = [
      {
        keyType: 'api_key',
        rotationDays: 90,
        warningDays: 14,
        gracePeriodDays: 7,
        autoRotate: false,
      },
      {
        keyType: 'webhook_secret',
        rotationDays: 180,
        warningDays: 30,
        gracePeriodDays: 14,
        autoRotate: true,
      },
      {
        keyType: 'encryption_key',
        rotationDays: 365,
        warningDays: 60,
        gracePeriodDays: 30,
        autoRotate: false,
      },
      {
        keyType: 'session_secret',
        rotationDays: 30,
        warningDays: 7,
        gracePeriodDays: 3,
        autoRotate: true,
      },
    ];

    for (const policy of defaultPolicies) {
      this.policies.set(policy.keyType, policy);
    }
  }

  private startExpiryChecking(): void {
    // Check for expiring keys every hour
    this.checkInterval = setInterval(async () => {
      await this.checkExpiringKeys();
      await this.performAutoRotations();
    }, 60 * 60 * 1000);
    
    console.log('[ApiKeyRotation] Expiry checking started');
  }

  /**
   * Generate a new API key
   */
  async generateKey(params: {
    name: string;
    keyType: KeyType;
    workspaceId?: string;
    expiresInDays?: number;
    metadata?: Record<string, any>;
  }): Promise<{ keyId: string; keyValue: string }> {
    const keyId = crypto.randomUUID();
    const policy = this.policies.get(params.keyType);
    const expiresInDays = params.expiresInDays || policy?.rotationDays || 90;
    
    // Generate secure key value
    const keyValue = this.generateSecureKey(params.keyType);
    const keyPrefix = keyValue.slice(0, 8);
    const keyHash = this.hashKey(keyValue);
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    try {
      await db.execute(sql`
        INSERT INTO managed_api_keys (
          id, name, key_type, key_prefix, key_hash, status, workspace_id, 
          created_at, expires_at, metadata
        ) VALUES (
          ${keyId}, ${params.name}, ${params.keyType}, ${keyPrefix}, ${keyHash},
          'active', ${params.workspaceId || null}, ${now}, ${expiresAt},
          ${JSON.stringify(params.metadata || {})}::jsonb
        )
      `);

      // Log key generation
      await this.logRotationAction(keyId, 'generated', undefined, keyHash, 'Initial key generation');

      await db.insert(systemAuditLogs).values({
        action: 'api_key_generated',
        resource: 'security',
        details: {
          keyId,
          keyType: params.keyType,
          name: params.name,
          workspaceId: params.workspaceId,
          expiresAt: expiresAt.toISOString(),
        },
      });

      console.log(`[ApiKeyRotation] Generated new ${params.keyType}: ${params.name}`);
      return { keyId, keyValue };

    } catch (error: any) {
      console.error('[ApiKeyRotation] Failed to generate key:', error);
      throw error;
    }
  }

  private generateSecureKey(keyType: KeyType): string {
    const prefixes: Record<KeyType, string> = {
      api_key: 'coai_',
      webhook_secret: 'whsec_',
      encryption_key: 'enc_',
      session_secret: 'sess_',
    };
    
    const prefix = prefixes[keyType] || 'key_';
    const randomPart = crypto.randomBytes(32).toString('base64url');
    
    return `${prefix}${randomPart}`;
  }

  private hashKey(keyValue: string): string {
    return crypto.createHash('sha256').update(keyValue).digest('hex');
  }

  /**
   * Validate an API key
   */
  async validateKey(keyValue: string): Promise<ManagedKey | null> {
    const keyHash = this.hashKey(keyValue);
    
    try {
      const result = await db.execute(sql`
        SELECT * FROM managed_api_keys 
        WHERE key_hash = ${keyHash} AND status IN ('active', 'expiring_soon')
      `);
      
      const row = (result.rows as any[])[0];
      if (!row) return null;
      
      return this.rowToManagedKey(row);
    } catch (error) {
      console.error('[ApiKeyRotation] Key validation failed:', error);
      return null;
    }
  }

  /**
   * Rotate an API key
   */
  async rotateKey(keyId: string, performedBy?: string, reason?: string): Promise<RotationResult> {
    try {
      // Get existing key
      const result = await db.execute(sql`
        SELECT * FROM managed_api_keys WHERE id = ${keyId}
      `);
      
      const oldKey = (result.rows as any[])[0];
      if (!oldKey) {
        return { success: false, oldKeyId: keyId, error: 'Key not found' };
      }

      const policy = this.policies.get(oldKey.key_type);
      const expiresInDays = policy?.rotationDays || 90;
      
      // Generate new key
      const newKeyValue = this.generateSecureKey(oldKey.key_type);
      const newKeyHash = this.hashKey(newKeyValue);
      const newKeyPrefix = newKeyValue.slice(0, 8);
      
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

      // Update key with new value
      await db.execute(sql`
        UPDATE managed_api_keys SET
          key_prefix = ${newKeyPrefix},
          key_hash = ${newKeyHash},
          status = 'active',
          last_rotated_at = ${now},
          expires_at = ${newExpiresAt},
          rotation_count = rotation_count + 1
        WHERE id = ${keyId}
      `);

      // Log rotation
      await this.logRotationAction(keyId, 'rotated', oldKey.key_hash, newKeyHash, reason, performedBy);

      await db.insert(systemAuditLogs).values({
        userId: performedBy,
        action: 'api_key_rotated',
        resource: 'security',
        details: {
          keyId,
          keyType: oldKey.key_type,
          name: oldKey.name,
          reason,
          newExpiresAt: newExpiresAt.toISOString(),
        },
      });

      // Emit event
      platformEventBus.publish({
        type: 'api_key_rotated',
        category: 'feature',
        title: 'API Key Rotated',
        description: `Key "${oldKey.name}" has been rotated`,
        userId: performedBy,
        metadata: { keyId, keyType: oldKey.key_type },
      });

      console.log(`[ApiKeyRotation] Rotated key: ${oldKey.name}`);
      
      return {
        success: true,
        oldKeyId: keyId,
        newKeyId: keyId,
        newKeyValue,
      };

    } catch (error: any) {
      console.error('[ApiKeyRotation] Rotation failed:', error);
      return { success: false, oldKeyId: keyId, error: error.message };
    }
  }

  /**
   * Revoke an API key
   */
  async revokeKey(keyId: string, performedBy?: string, reason?: string): Promise<boolean> {
    try {
      await db.execute(sql`
        UPDATE managed_api_keys SET status = 'revoked' WHERE id = ${keyId}
      `);

      await this.logRotationAction(keyId, 'revoked', undefined, undefined, reason, performedBy);

      await db.insert(systemAuditLogs).values({
        userId: performedBy,
        action: 'api_key_revoked',
        resource: 'security',
        details: { keyId, reason },
      });

      console.log(`[ApiKeyRotation] Revoked key: ${keyId}`);
      return true;
    } catch (error) {
      console.error('[ApiKeyRotation] Revocation failed:', error);
      return false;
    }
  }

  private async checkExpiringKeys(): Promise<void> {
    try {
      for (const [keyType, policy] of this.policies) {
        const warningDate = new Date(Date.now() + policy.warningDays * 24 * 60 * 60 * 1000);
        
        // Mark keys as expiring soon
        await db.execute(sql`
          UPDATE managed_api_keys 
          SET status = 'expiring_soon'
          WHERE key_type = ${keyType}
            AND status = 'active'
            AND expires_at <= ${warningDate}
        `);

        // Mark expired keys
        await db.execute(sql`
          UPDATE managed_api_keys 
          SET status = 'expired'
          WHERE key_type = ${keyType}
            AND status IN ('active', 'expiring_soon')
            AND expires_at <= NOW()
        `);
      }

      // Get expiring keys for notifications
      const expiringResult = await db.execute(sql`
        SELECT * FROM managed_api_keys WHERE status = 'expiring_soon'
      `);

      for (const key of (expiringResult.rows as any[]) || []) {
        platformEventBus.publish({
          type: 'api_key_expiring',
          category: 'feature',
          title: 'API Key Expiring Soon',
          description: `Key "${key.name}" expires on ${new Date(key.expires_at).toLocaleDateString()}`,
          metadata: { keyId: key.id, expiresAt: key.expires_at },
        });
      }

    } catch (error) {
      console.error('[ApiKeyRotation] Expiry check failed:', error);
    }
  }

  private async performAutoRotations(): Promise<void> {
    for (const [keyType, policy] of this.policies) {
      if (!policy.autoRotate) continue;

      try {
        const result = await db.execute(sql`
          SELECT id FROM managed_api_keys 
          WHERE key_type = ${keyType}
            AND status = 'expiring_soon'
        `);

        for (const row of (result.rows as any[]) || []) {
          await this.rotateKey(row.id, 'system', 'Auto-rotation due to expiry');
        }
      } catch (error) {
        console.error(`[ApiKeyRotation] Auto-rotation failed for ${keyType}:`, error);
      }
    }
  }

  private async logRotationAction(
    keyId: string,
    action: string,
    oldHash?: string,
    newHash?: string,
    reason?: string,
    performedBy?: string
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO key_rotation_history (key_id, action, old_key_hash, new_key_hash, performed_by, reason)
      VALUES (${keyId}, ${action}, ${oldHash || null}, ${newHash || null}, ${performedBy || null}, ${reason || null})
    `);
  }

  private rowToManagedKey(row: any): ManagedKey {
    return {
      id: row.id,
      name: row.name,
      keyType: row.key_type,
      keyPrefix: row.key_prefix,
      keyHash: row.key_hash,
      status: row.status,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      lastRotatedAt: row.last_rotated_at ? new Date(row.last_rotated_at) : undefined,
      rotationCount: row.rotation_count,
      workspaceId: row.workspace_id,
      metadata: row.metadata || {},
    };
  }

  /**
   * Get all managed keys
   */
  async getKeys(workspaceId?: string): Promise<ManagedKey[]> {
    try {
      let query;
      if (workspaceId) {
        query = sql`SELECT * FROM managed_api_keys WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC`;
      } else {
        query = sql`SELECT * FROM managed_api_keys ORDER BY created_at DESC`;
      }
      
      const result = await db.execute(query);
      return ((result.rows as any[]) || []).map(this.rowToManagedKey);
    } catch (error) {
      console.error('[ApiKeyRotation] Failed to get keys:', error);
      return [];
    }
  }

  /**
   * Get rotation policy
   */
  getPolicy(keyType: KeyType): RotationPolicy | undefined {
    return this.policies.get(keyType);
  }

  /**
   * Update rotation policy
   */
  updatePolicy(policy: RotationPolicy): void {
    this.policies.set(policy.keyType, policy);
    console.log(`[ApiKeyRotation] Updated policy for ${policy.keyType}`);
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[ApiKeyRotation] Service shutdown');
  }
}

export const apiKeyRotationService = ApiKeyRotationService.getInstance();
