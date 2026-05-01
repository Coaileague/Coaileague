/**
 * QuickBooks Token Refresh Daemon
 * 
 * Proactively refreshes OAuth tokens before they expire to prevent
 * sync failures and ensure uninterrupted QuickBooks connectivity.
 * 
 * Token Lifecycle:
 * - Access tokens: 1 hour expiry
 * - Refresh tokens: 100 days expiry
 * - Refresh threshold: 15 minutes before access token expiry
 * 
 * Features:
 * - Uses partner_connections table for credential storage
 * - Proactive refresh scheduling
 * - Retry with exponential backoff on failures
 * - Event bus notifications for token status changes
 * 
 * Requirements:
 * - Node.js 18+ (native fetch API required)
 */

import { db } from '../../db';
import { eq, lt, and, sql } from 'drizzle-orm';
import { partnerConnections } from '@shared/schema';
import { platformEventBus } from '../platformEventBus';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { universalStepLogger } from '../orchestration/universalStepLogger';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksTokenRefresh');


interface StoredCredentials {
  id: string;
  workspaceId: string;
  realmId: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  status: string;
  metadata: Record<string, any> | null;
}

interface RefreshResult {
  success: boolean;
  credentials?: StoredCredentials;
  error?: string;
  nextRetryAt?: Date;
}

class QuickBooksTokenRefreshDaemon {
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
  private readonly REFRESH_THRESHOLD_MS = 15 * 60 * 1000; // Refresh 15 min before expiry
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private readonly BASE_RETRY_DELAY_MS = 60 * 1000; // 1 minute base delay
  
  private credentialsCache: Map<string, StoredCredentials> = new Map();
  
  async start(): Promise<void> {
    if (this.isRunning) {
      log.info('[QB TokenRefresh] Daemon already running');
      return;
    }
    
    log.info('[QB TokenRefresh] Starting token refresh daemon (using partner_connections)');
    this.isRunning = true;
    
    await this.checkAndRefreshTokens();
    
    this.refreshInterval = setInterval(
      () => this.checkAndRefreshTokens(),
      this.CHECK_INTERVAL_MS
    );
  }
  
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.isRunning = false;
    log.info('[QB TokenRefresh] Daemon stopped');
  }
  
  private async checkAndRefreshTokens(): Promise<void> {
    try {
      const expiringCredentials = await this.getExpiringCredentials();
      
      if (expiringCredentials.length === 0) {
        return;
      }
      
      log.info(`[QB TokenRefresh] Found ${expiringCredentials.length} QuickBooks connections needing refresh`);
      
      for (const creds of expiringCredentials) {
        await this.refreshCredentials(creds);
      }
    } catch (error) {
      log.error('[QB TokenRefresh] Error checking tokens:', error);
    }
  }
  
  private async getExpiringCredentials(): Promise<StoredCredentials[]> {
    const threshold = new Date(Date.now() + this.REFRESH_THRESHOLD_MS);
    
    try {
      const results = await db.select({
        id: partnerConnections.id,
        workspaceId: partnerConnections.workspaceId,
        realmId: partnerConnections.realmId,
        accessToken: partnerConnections.accessToken,
        refreshToken: partnerConnections.refreshToken,
        expiresAt: partnerConnections.expiresAt,
        refreshTokenExpiresAt: partnerConnections.refreshTokenExpiresAt,
        status: partnerConnections.status,
        metadata: partnerConnections.metadata,
      })
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected'),
          lt(partnerConnections.expiresAt, threshold)
        )
      );
      
      // Filter out connections that have exceeded max retry attempts
      return results.filter(cred => {
        const failedAttempts = (cred as any).metadata?.failedRefreshAttempts || 0;
        return failedAttempts < this.MAX_RETRY_ATTEMPTS;
      }) as StoredCredentials[];
    } catch (error) {
      log.warn('[QB TokenRefresh] Error fetching expiring credentials:', error);
      return [];
    }
  }
  
  private async refreshCredentials(creds: StoredCredentials): Promise<RefreshResult> {
    let orchestrationId: string | null = null;
    
    try {
      const failedAttempts = (creds as any).metadata?.failedRefreshAttempts || 0;
      if (failedAttempts >= this.MAX_RETRY_ATTEMPTS) {
        log.warn(`[QB TokenRefresh] Connection ${creds.id} exceeded max retry attempts (${failedAttempts}/${this.MAX_RETRY_ATTEMPTS}), marking expired`);
        await this.markConnectionExpired(creds.id);
        return { success: false, error: 'Max retry attempts exceeded - reauthorization required' };
      }
      // Start 7-step orchestration for token refresh
      const orchestration = await universalStepLogger.startOrchestration({
        domain: 'quickbooks',
        actionName: 'token_refresh',
        actionId: `token-refresh-${creds.id}`,
        workspaceId: creds.workspaceId,
        triggeredBy: 'cron',
        triggerDetails: { connectionId: creds.id, realmId: creds.realmId },
        externalSystem: 'quickbooks',
      });
      orchestrationId = orchestration.orchestrationId;

      // STEP 1: TRIGGER - Already done by startOrchestration
      await universalStepLogger.executeStep(orchestrationId, 'TRIGGER', async () => ({
        success: true,
        data: { connectionId: creds.id, workspaceId: creds.workspaceId },
      }));

      // STEP 2: FETCH - Validate refresh token exists
      const fetchResult = await universalStepLogger.executeStep(orchestrationId, 'FETCH', async () => {
        if (!creds.refreshToken) {
          return { success: false, error: 'No refresh token available', errorCode: 'MISSING_REFRESH_TOKEN' };
        }
        return { success: true, data: { hasRefreshToken: true } };
      });

      if (!fetchResult.success) {
        await universalStepLogger.failOrchestration(orchestrationId, fetchResult.error || 'Fetch failed', 'MISSING_REFRESH_TOKEN');
        return { success: false, error: fetchResult.error || 'No refresh token available' };
      }

      // STEP 3: VALIDATE - Check token expiry
      const validateResult = await universalStepLogger.executeStep(orchestrationId, 'VALIDATE', async () => {
        if (creds.refreshTokenExpiresAt && new Date(creds.refreshTokenExpiresAt) < new Date()) {
          platformEventBus.publish({
            type: 'ai_brain_action',
            category: 'automation',
            title: 'QuickBooks Token Expired',
            description: `QuickBooks refresh token expired for realm ${creds.realmId}. Reauthorization required.`,
            workspaceId: creds.workspaceId,
            metadata: { realmId: creds.realmId, reason: 'refresh_token_expired' },
          }).catch((err) => log.warn('[quickbooksTokenRefresh] Fire-and-forget failed:', err));
          await this.markConnectionExpired(creds.id);
          return { success: false, error: 'Refresh token expired - reauthorization required', errorCode: 'TOKEN_EXPIRED' };
        }
        return { success: true, data: { tokenValid: true } };
      }, { validateSubscription: false });

      if (!validateResult.success) {
        await universalStepLogger.failOrchestration(orchestrationId, validateResult.error || 'Validation failed', 'TOKEN_EXPIRED');
        return { success: false, error: validateResult.error || 'Refresh token expired' };
      }
      
      // STEP 4: PROCESS — Delegate token exchange to quickbooksOAuthService.refreshAccessToken().
      // This is the ONLY authoritative path: it decrypts the stored refresh token, calls the
      // QB token endpoint, re-encrypts the new tokens, and writes them back to the DB.
      // The daemon MUST NOT make its own raw HTTP call or write tokens directly — doing so
      // bypasses encryption and causes the two-path storage corruption described in GAP-1.
      const processResult = await universalStepLogger.executeStep(orchestrationId, 'PROCESS', async () => {
        try {
          await quickbooksOAuthService.refreshAccessToken(creds.id);
          return { success: true, data: { refreshed: true } };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // refreshAccessToken() throws with 'must reconnect' on invalid_grant or expired token
          const isPermanent = msg.includes('must reconnect') || msg.includes('expired');
          return {
            success: false,
            error: msg,
            errorCode: isPermanent ? 'INVALID_GRANT' : 'API_ERROR',
          };
        }
      }, { inputPayload: { connectionId: creds.id } });

      if (!processResult.success) {
        const isInvalidGrant = processResult.errorCode === 'INVALID_GRANT';
        await universalStepLogger.failOrchestration(orchestrationId, processResult.error || 'Process failed', processResult.errorCode || 'API_ERROR');

        if (isInvalidGrant) {
          platformEventBus.publish({
            type: 'ai_brain_action',
            category: 'automation',
            title: 'QuickBooks Connection Expired',
            description: `QuickBooks refresh token is invalid for realm ${creds.realmId}. Please reconnect your QuickBooks account from Settings > Integrations.`,
            workspaceId: creds.workspaceId,
            metadata: {
              realmId: creds.realmId,
              reason: 'invalid_grant',
              orchestrationId,
            },
          }).catch((err) => log.warn('[quickbooksTokenRefresh] Fire-and-forget failed:', err));
          return { success: false, error: processResult.error || 'Invalid grant - reconnection required' };
        }

        const failedAttempts = ((creds as any).metadata?.failedRefreshAttempts || 0) + 1;
        const retryDelay = this.BASE_RETRY_DELAY_MS * Math.pow(2, failedAttempts - 1);
        await this.incrementFailedAttempts(creds.id, failedAttempts, creds.metadata);

        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'automation',
          title: 'QuickBooks Token Refresh Failed',
          description: `Token refresh failed for realm ${creds.realmId}: ${processResult.error}. Retry attempt ${failedAttempts} scheduled.`,
          workspaceId: creds.workspaceId,
          metadata: {
            realmId: creds.realmId,
            reason: 'token_refresh_failed',
            errorCode: processResult.errorCode,
            retryAttempt: failedAttempts,
            orchestrationId,
          },
        }).catch((err) => log.warn('[quickbooksTokenRefresh] Fire-and-forget failed:', err));

        return {
          success: false,
          error: processResult.error || 'Token refresh failed',
          nextRetryAt: new Date(Date.now() + retryDelay),
        };
      }

      log.info(`[QB TokenRefresh] Successfully refreshed token for workspace ${creds.workspaceId}`);

      // STEP 5: CONFIRM
      await universalStepLogger.executeStep(orchestrationId, 'CONFIRM', async () => {
        return { success: true, data: { confirmed: true } };
      });

      // STEP 6: NOTIFY
      await universalStepLogger.executeStep(orchestrationId, 'NOTIFY', async () => {
        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'automation',
          title: 'QuickBooks Token Refreshed',
          description: `QuickBooks access token successfully refreshed for realm ${creds.realmId}.`,
          workspaceId: creds.workspaceId,
          metadata: {
            realmId: creds.realmId,
            orchestrationId,
          },
        }).catch((err) => log.warn('[quickbooksTokenRefresh] Fire-and-forget failed:', err));
        return { success: true, data: { notified: true } };
      });

      // Complete orchestration
      await universalStepLogger.completeOrchestration(orchestrationId, { refreshed: true });

      // Invalidate local cache — next getCredentials() call will fetch fresh encrypted data from DB
      this.credentialsCache.delete(creds.workspaceId);

      return { success: true };
    } catch (error: unknown) {
      log.error(`[QB TokenRefresh] Error refreshing token for workspace ${creds.workspaceId}:`, error);
      
      const failedAttempts = ((creds as any).metadata?.failedRefreshAttempts || 0) + 1;
      await this.incrementFailedAttempts(creds.id, failedAttempts, creds.metadata);
      
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }
  
  private async incrementFailedAttempts(id: string, attempts: number, passedMetadata: Record<string, any> | null): Promise<void> {
    try {
      // First fetch current metadata to perform deep merge
      const [current] = await db.select({ metadata: partnerConnections.metadata })
        .from(partnerConnections)
        .where(eq(partnerConnections.id, id))
        .limit(1);
      
      // Deep merge: preserve existing keys, update failure tracking fields
      const existingMetadata = (current?.metadata as Record<string, any>) || {};
      const newMetadata = {
        ...existingMetadata,
        ...(passedMetadata || {}),
        failedRefreshAttempts: attempts,
        lastFailedAttempt: new Date().toISOString(),
      };
      
      await db.update(partnerConnections)
        .set({
          metadata: newMetadata,
          lastErrorAt: new Date(),
          lastError: `Token refresh failed (attempt ${attempts}/${this.MAX_RETRY_ATTEMPTS})`,
          updatedAt: new Date(),
        })
        .where(eq(partnerConnections.id, id));
    } catch (error) {
      log.error('[QB TokenRefresh] Failed to update failed attempts:', error);
    }
  }
  
  private async markConnectionExpired(id: string): Promise<void> {
    try {
      await db.update(partnerConnections)
        .set({
          status: 'expired',
          lastErrorAt: new Date(),
          lastError: 'Refresh token expired - reauthorization required',
          updatedAt: new Date(),
        })
        .where(eq(partnerConnections.id, id));
    } catch (error) {
      log.error('[QB TokenRefresh] Failed to mark connection expired:', error);
    }
  }
  
  async forceRefresh(workspaceId: string): Promise<RefreshResult> {
    try {
      const [connection] = await db.select({
        id: partnerConnections.id,
        workspaceId: partnerConnections.workspaceId,
        realmId: partnerConnections.realmId,
        accessToken: partnerConnections.accessToken,
        refreshToken: partnerConnections.refreshToken,
        expiresAt: partnerConnections.expiresAt,
        refreshTokenExpiresAt: partnerConnections.refreshTokenExpiresAt,
        status: partnerConnections.status,
        metadata: partnerConnections.metadata,
      })
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        )
      )
      .limit(1);
      
      if (!connection) {
        return {
          success: false,
          error: 'No active QuickBooks connection found for workspace',
        };
      }
      
      return this.refreshCredentials(connection as StoredCredentials);
    } catch (error: unknown) {
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }
  
  async getCredentials(workspaceId: string): Promise<StoredCredentials | null> {
    const cached = this.credentialsCache.get(workspaceId);
    if (cached && cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
      return cached;
    }
    
    try {
      const [connection] = await db.select({
        id: partnerConnections.id,
        workspaceId: partnerConnections.workspaceId,
        realmId: partnerConnections.realmId,
        accessToken: partnerConnections.accessToken,
        refreshToken: partnerConnections.refreshToken,
        expiresAt: partnerConnections.expiresAt,
        refreshTokenExpiresAt: partnerConnections.refreshTokenExpiresAt,
        status: partnerConnections.status,
        metadata: partnerConnections.metadata,
      })
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        )
      )
      .limit(1);
      
      if (!connection) {
        return null;
      }
      
      const creds = connection as StoredCredentials;
      
      // Check if token needs refresh
      if (creds.expiresAt && new Date(creds.expiresAt) < new Date(Date.now() + this.REFRESH_THRESHOLD_MS)) {
        const refreshResult = await this.refreshCredentials(creds);
        if (refreshResult.success && refreshResult.credentials) {
          this.credentialsCache.set(workspaceId, refreshResult.credentials);
          return refreshResult.credentials;
        }
      }
      
      this.credentialsCache.set(workspaceId, creds);
      return creds;
    } catch (error) {
      log.error('[QB TokenRefresh] Error getting credentials:', error);
      return null;
    }
  }
  
  getStatus(): { isRunning: boolean; cachedCredentials: number } {
    return {
      isRunning: this.isRunning,
      cachedCredentials: this.credentialsCache.size,
    };
  }
  
  /**
   * Check token health - warn about refresh tokens expiring within 30 days
   * Recommended to run daily via cron job
   */
  async checkTokenHealth(): Promise<{
    healthy: number;
    expiringSoon: number;
    expired: number;
    expiringConnections: Array<{ workspaceId: string; realmId: string | null; expiresIn: number }>;
  }> {
    let healthy = 0;
    let expiringSoon = 0;
    let expired = 0;
    const expiringConnections: Array<{ workspaceId: string; realmId: string | null; expiresIn: number }> = [];
    
    try {
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const now = new Date();
      
      const connections = await db.select({
        workspaceId: partnerConnections.workspaceId,
        realmId: partnerConnections.realmId,
        refreshTokenExpiresAt: partnerConnections.refreshTokenExpiresAt,
        status: partnerConnections.status,
      })
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        )
      );
      
      for (const conn of connections) {
        if (!conn.refreshTokenExpiresAt) {
          healthy++;
          continue;
        }
        
        const expiresAt = new Date(conn.refreshTokenExpiresAt);
        
        if (expiresAt < now) {
          expired++;
          log.warn(`[QB TokenHealth] Refresh token EXPIRED for workspace ${conn.workspaceId}`);
        } else if (expiresAt < thirtyDaysFromNow) {
          expiringSoon++;
          const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          expiringConnections.push({
            workspaceId: conn.workspaceId,
            realmId: conn.realmId,
            expiresIn: daysRemaining,
          });
          log.warn(`[QB TokenHealth] Refresh token expires in ${daysRemaining} days for workspace ${conn.workspaceId}`);
        } else {
          healthy++;
        }
      }
      
      if (expiringSoon > 0 || expired > 0) {
        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'automation',
          title: 'QuickBooks Token Health Alert',
          description: `QuickBooks token health check: ${healthy} healthy, ${expiringSoon} expiring soon, ${expired} expired`,
          metadata: {
            healthy,
            expiringSoon,
            expired,
            expiringConnections,
          },
        }).catch((err) => log.warn('[quickbooksTokenRefresh] Fire-and-forget failed:', err));
      }
      
      log.info(`[QB TokenHealth] Health check: ${healthy} healthy, ${expiringSoon} expiring soon, ${expired} expired`);
    } catch (error) {
      log.error('[QB TokenHealth] Error checking token health:', error);
    }
    
    return { healthy, expiringSoon, expired, expiringConnections };
  }
  
  /**
   * Keep all tokens fresh - proactively refresh even non-expiring tokens
   * Recommended to run daily to prevent 100-day refresh token expiry
   */
  async keepAllTokensFresh(): Promise<{ refreshed: number; failed: number; skipped: number }> {
    let refreshed = 0;
    let failed = 0;
    let skipped = 0;
    
    try {
      const connections = await db.select({
        id: partnerConnections.id,
        workspaceId: partnerConnections.workspaceId,
        realmId: partnerConnections.realmId,
        accessToken: partnerConnections.accessToken,
        refreshToken: partnerConnections.refreshToken,
        expiresAt: partnerConnections.expiresAt,
        refreshTokenExpiresAt: partnerConnections.refreshTokenExpiresAt,
        status: partnerConnections.status,
        metadata: partnerConnections.metadata,
      })
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        )
      );
      
      log.info(`[QB TokenRefresh] Proactive refresh for ${connections.length} QuickBooks connections`);
      
      for (const conn of connections) {
        if (!conn.refreshToken) {
          skipped++;
          continue;
        }
        
        const failedAttempts = (conn as any).metadata?.failedRefreshAttempts || 0;
        if (failedAttempts >= this.MAX_RETRY_ATTEMPTS) {
          log.warn(`[QB TokenRefresh] Skipping workspace ${conn.workspaceId} - exceeded max retry attempts (${failedAttempts}/${this.MAX_RETRY_ATTEMPTS}). Reconnection required.`);
          skipped++;
          continue;
        }
        
        const result = await this.refreshCredentials(conn as StoredCredentials);
        if (result.success) {
          refreshed++;
        } else {
          failed++;
        }
      }
      
      log.info(`[QB TokenRefresh] Proactive refresh complete: ${refreshed} refreshed, ${failed} failed, ${skipped} skipped`);
      
      if (refreshed > 0 || failed > 0) {
        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'automation',
          title: 'QuickBooks Daily Token Refresh',
          description: `Daily token refresh: ${refreshed} refreshed, ${failed} failed, ${skipped} skipped`,
          metadata: { refreshed, failed, skipped },
        }).catch((err) => log.warn('[quickbooksTokenRefresh] Fire-and-forget failed:', err));
      }
    } catch (error) {
      log.error('[QB TokenRefresh] Error in proactive refresh:', error);
    }
    
    return { refreshed, failed, skipped };
  }
  
  /**
   * Public method to manually trigger token refresh for all expiring connections.
   * Called from integration routes when token issues are detected.
   */
  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    let refreshed = 0;
    let failed = 0;
    
    try {
      const expiringCredentials = await this.getExpiringCredentials();
      
      for (const creds of expiringCredentials) {
        const result = await this.refreshCredentials(creds);
        if (result.success) {
          refreshed++;
        } else {
          failed++;
        }
      }
      
      log.info(`[QB TokenRefresh] Manual refresh complete: ${refreshed} refreshed, ${failed} failed`);
    } catch (error) {
      log.error('[QB TokenRefresh] Error in manual refresh:', error);
    }
    
    return { refreshed, failed };
  }
}

export const quickbooksTokenRefresh = new QuickBooksTokenRefreshDaemon();
