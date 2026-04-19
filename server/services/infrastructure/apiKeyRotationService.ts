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
import { systemAuditLogs, managedApiKeys, keyRotationHistory } from '@shared/schema';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import crypto from 'crypto';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('apiKeyRotationService');

/**
 * Readiness Section 12 — documented rotation cadence.
 * This is the source of truth for how often each secret should rotate.
 * Referenced in docs/SECURITY_AND_DR.md §7.
 *
 * Note: ENCRYPTION_KEY intentionally has no cadence — rotating it breaks
 * already-encrypted data. A key-versioning scheme must be added before
 * ENCRYPTION_KEY rotation is possible.
 */
export const SECRET_ROTATION_CADENCE_DAYS = {
  SESSION_SECRET: 90,
  TWILIO_AUTH_TOKEN: 180,
  RESEND_API_KEY: 180,
  STRIPE_SECRET_KEY: 365,
  OPENAI_API_KEY: 180,
  ANTHROPIC_API_KEY: 180,
  GEMINI_API_KEY: 180,
  PLAID_SECRET: 180,
  VAPID_PRIVATE_KEY: 365,
  // ENCRYPTION_KEY intentionally omitted — see comment above.
} as const;

export type ManagedSecretName = keyof typeof SECRET_ROTATION_CADENCE_DAYS;


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
      log.info('[ApiKeyRotation] Service initialized');
    } catch (error) {
      log.error('[ApiKeyRotation] Failed to initialize:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
      await typedExec(sql`
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
      log.error('[ApiKeyRotation] Failed to create tables:', error);
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
    
    log.info('[ApiKeyRotation] Expiry checking started');
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
      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: managed_api_keys | Verified: 2026-03-23
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(managedApiKeys).values({
        id: keyId,
        name: params.name,
        keyType: params.keyType,
        keyPrefix: keyPrefix,
        keyHash: keyHash,
        status: 'active',
        workspaceId: params.workspaceId || null,
        createdAt: now,
        expiresAt: expiresAt,
        metadata: params.metadata || {},
      });

      // Log key generation
      await this.logRotationAction(keyId, 'generated', undefined, keyHash, 'Initial key generation');

      await db.insert(systemAuditLogs).values({
        action: 'api_key_generated',
        entityId: 'security',
        metadata: {
          keyId,
          keyType: params.keyType,
          name: params.name,
          workspaceId: params.workspaceId,
          expiresAt: expiresAt.toISOString(),
        },
      });

      log.info(`[ApiKeyRotation] Generated new ${params.keyType}: ${params.name}`);
      return { keyId, keyValue };

    } catch (error: any) {
      log.error('[ApiKeyRotation] Failed to generate key:', error);
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
      // Converted to Drizzle ORM: IN subquery → inArray()
      const resultRows = await db.select()
        .from(managedApiKeys)
        .where(and(
          eq(managedApiKeys.keyHash, keyHash),
          inArray(managedApiKeys.status, ['active', 'expiring_soon'])
        ));
      
      const row = resultRows[0];
      if (!row) return null;
      
      return this.rowToManagedKey(row);
    } catch (error) {
      log.error('[ApiKeyRotation] Key validation failed:', error);
      return null;
    }
  }

  /**
   * Rotate an API key
   */
  async rotateKey(keyId: string, performedBy?: string, reason?: string): Promise<RotationResult> {
    try {
      // Get existing key
      const result = await db.select().from(managedApiKeys).where(eq(managedApiKeys.id, keyId));
      
      const oldKey = ((result as any).rows as any[])[0];
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

      await db.update(managedApiKeys).set({
        keyPrefix: newKeyPrefix,
        keyHash: newKeyHash,
        status: 'active',
        lastRotatedAt: now,
        expiresAt: newExpiresAt,
        rotationCount: sql`${managedApiKeys.rotationCount} + 1`,
      }).where(eq(managedApiKeys.id, keyId));

      // Log rotation
      await this.logRotationAction(keyId, 'rotated', oldKey.key_hash, newKeyHash, reason, performedBy);

      await db.insert(systemAuditLogs).values({
        userId: performedBy,
        action: 'api_key_rotated',
        entityId: 'security',
        metadata: {
          keyId,
          keyType: oldKey.key_type,
          name: oldKey.name,
          reason,
          newExpiresAt: newExpiresAt.toISOString(),
        },
      });

      // Emit event (awaited; non-blocking failure)
      try {
        await platformEventBus.publish({
          type: 'api_key_rotated',
          category: 'feature',
          title: 'API Key Rotated',
          description: `Key "${oldKey.name}" has been rotated`,
          userId: performedBy,
          metadata: { keyId, keyType: oldKey.key_type },
        });
      } catch (err) {
        log.warn('[apiKeyRotationService] Event publish failed (non-fatal):', err);
      }

      log.info(`[ApiKeyRotation] Rotated key: ${oldKey.name}`);
      
      return {
        success: true,
        oldKeyId: keyId,
        newKeyId: keyId,
        newKeyValue,
      };

    } catch (error: any) {
      log.error('[ApiKeyRotation] Rotation failed:', error);
      return { success: false, oldKeyId: keyId, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Revoke an API key
   */
  async revokeKey(keyId: string, performedBy?: string, reason?: string): Promise<boolean> {
    try {
      await db.update(managedApiKeys).set({
        status: 'revoked',
      }).where(eq(managedApiKeys.id, keyId));

      await this.logRotationAction(keyId, 'revoked', undefined, undefined, reason, performedBy);

      await db.insert(systemAuditLogs).values({
        userId: performedBy,
        action: 'api_key_revoked',
        entityId: 'security',
        metadata: { keyId, reason },
      });

      log.info(`[ApiKeyRotation] Revoked key: ${keyId}`);
      return true;
    } catch (error) {
      log.error('[ApiKeyRotation] Revocation failed:', error);
      return false;
    }
  }

  private async checkExpiringKeys(): Promise<void> {
    try {
      for (const [keyType, policy] of this.policies) {
        const warningDate = new Date(Date.now() + policy.warningDays * 24 * 60 * 60 * 1000);
        
        await db.update(managedApiKeys).set({
          status: 'expiring_soon',
        }).where(and(
          eq(managedApiKeys.keyType, keyType),
          eq(managedApiKeys.status, 'active'),
          sql`${managedApiKeys.expiresAt} <= ${warningDate}`
        ));

        await db.update(managedApiKeys).set({
          status: 'expired',
        }).where(and(
          eq(managedApiKeys.keyType, keyType),
          inArray(managedApiKeys.status, ['active', 'expiring_soon']),
          sql`${managedApiKeys.expiresAt} <= NOW()`
        ));
      }

      // CATEGORY C — Raw SQL retained: Infrastructure service SELECT * | Tables: managed_api_keys | Verified: 2026-03-23
      const expiringResult = await typedQuery(sql`
        SELECT * FROM managed_api_keys WHERE status = 'expiring_soon'
      `);

      for (const key of (expiringResult as any[]) || []) {
        try {
          await platformEventBus.publish({
            type: 'api_key_expiring',
            category: 'feature',
            title: 'API Key Expiring Soon',
            description: `Key "${key.name}" expires on ${new Date(key.expires_at).toLocaleDateString()}`,
            metadata: { keyId: key.id, expiresAt: key.expires_at },
          });
        } catch (err) {
          log.warn('[apiKeyRotationService] Event publish failed (non-fatal):', err);
        }
      }

    } catch (error) {
      log.error('[ApiKeyRotation] Expiry check failed:', error);
    }
  }

  private async performAutoRotations(): Promise<void> {
    for (const [keyType, policy] of this.policies) {
      if (!policy.autoRotate) continue;

      try {
        // CATEGORY C — Raw SQL retained: Infrastructure service auto-rotation query | Tables: managed_api_keys | Verified: 2026-03-23
        const result = await typedQuery(sql`
          SELECT id FROM managed_api_keys 
          WHERE key_type = ${keyType}
            AND status = 'expiring_soon'
        `);

        for (const row of (result as any[]) || []) {
          await this.rotateKey(row.id, 'system', 'Auto-rotation due to expiry');
        }
      } catch (error) {
        log.error(`[ApiKeyRotation] Auto-rotation failed for ${keyType}:`, error);
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
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(keyRotationHistory).values({
      keyId: keyId,
      action: action,
      oldKeyHash: oldHash || null,
      newKeyHash: newHash || null,
      performedBy: performedBy || null,
      reason: reason || null,
    });
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
      
      // CATEGORY C — Raw SQL retained: Dynamic query execution | Tables: managed_api_keys | Verified: 2026-03-23
      const result = await typedQuery(query);
      return (result as any[]).map(this.rowToManagedKey);
    } catch (error) {
      log.error('[ApiKeyRotation] Failed to get keys:', error);
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
    log.info(`[ApiKeyRotation] Updated policy for ${policy.keyType}`);
  }

  shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info('[ApiKeyRotation] Service shutdown');
  }
}

export const apiKeyRotationService = ApiKeyRotationService.getInstance();
