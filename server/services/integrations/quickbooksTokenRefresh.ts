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
import { quickbooksDiscovery } from './quickbooksDiscovery';

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
      console.log('[QB TokenRefresh] Daemon already running');
      return;
    }
    
    console.log('[QB TokenRefresh] Starting token refresh daemon (using partner_connections)');
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
    console.log('[QB TokenRefresh] Daemon stopped');
  }
  
  private async checkAndRefreshTokens(): Promise<void> {
    try {
      const expiringCredentials = await this.getExpiringCredentials();
      
      if (expiringCredentials.length === 0) {
        return;
      }
      
      console.log(`[QB TokenRefresh] Found ${expiringCredentials.length} QuickBooks connections needing refresh`);
      
      for (const creds of expiringCredentials) {
        await this.refreshCredentials(creds);
      }
    } catch (error) {
      console.error('[QB TokenRefresh] Error checking tokens:', error);
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
        const failedAttempts = (cred.metadata as any)?.failedRefreshAttempts || 0;
        return failedAttempts < this.MAX_RETRY_ATTEMPTS;
      }) as StoredCredentials[];
    } catch (error) {
      console.warn('[QB TokenRefresh] Error fetching expiring credentials:', error);
      return [];
    }
  }
  
  private async refreshCredentials(creds: StoredCredentials): Promise<RefreshResult> {
    try {
      if (!creds.refreshToken) {
        console.warn(`[QB TokenRefresh] No refresh token for workspace ${creds.workspaceId}`);
        return {
          success: false,
          error: 'No refresh token available',
        };
      }
      
      if (creds.refreshTokenExpiresAt && new Date(creds.refreshTokenExpiresAt) < new Date()) {
        console.warn(`[QB TokenRefresh] Refresh token expired for workspace ${creds.workspaceId}`);
        
        platformEventBus.publish({
          type: 'ai_brain_action',
          category: 'automation',
          title: 'QuickBooks Token Expired',
          description: `QuickBooks refresh token expired for realm ${creds.realmId}. Reauthorization required.`,
          workspaceId: creds.workspaceId,
          metadata: {
            realmId: creds.realmId,
            reason: 'refresh_token_expired',
          },
        });
        
        await this.markConnectionExpired(creds.id);
        
        return {
          success: false,
          error: 'Refresh token expired - reauthorization required',
        };
      }
      
      const environment = process.env.QUICKBOOKS_ENVIRONMENT as 'production' | 'sandbox' || 'sandbox';
      const tokenEndpoint = await quickbooksDiscovery.getTokenEndpoint(environment);
      
      const clientId = process.env.QUICKBOOKS_CLIENT_ID;
      const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        return {
          success: false,
          error: 'QuickBooks credentials not configured',
        };
      }
      
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: creds.refreshToken,
        }).toString(),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QB TokenRefresh] Token refresh failed for workspace ${creds.workspaceId}:`, errorText);
        
        const failedAttempts = ((creds.metadata as any)?.failedRefreshAttempts || 0) + 1;
        await this.incrementFailedAttempts(creds.id, failedAttempts, creds.metadata);
        
        const retryDelay = this.BASE_RETRY_DELAY_MS * Math.pow(2, failedAttempts - 1);
        
        return {
          success: false,
          error: `Token refresh failed: ${response.status}`,
          nextRetryAt: new Date(Date.now() + retryDelay),
        };
      }
      
      const tokens = await response.json();
      
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const newRefreshTokenExpiresAt = tokens.refresh_token 
        ? new Date(Date.now() + 100 * 24 * 60 * 60 * 1000) // 100 days
        : creds.refreshTokenExpiresAt;
      
      await this.updateCredentials(creds.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || creds.refreshToken,
        expiresAt: newExpiresAt,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
        metadata: creds.metadata,
      });
      
      console.log(`[QB TokenRefresh] Successfully refreshed token for workspace ${creds.workspaceId}`);
      
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'automation',
        title: 'QuickBooks Token Refreshed',
        description: `QuickBooks access token successfully refreshed for realm ${creds.realmId}.`,
        workspaceId: creds.workspaceId,
        metadata: {
          realmId: creds.realmId,
          expiresAt: newExpiresAt.toISOString(),
        },
      });
      
      const updatedCreds: StoredCredentials = {
        ...creds,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || creds.refreshToken,
        expiresAt: newExpiresAt,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      };
      
      this.credentialsCache.set(creds.workspaceId, updatedCreds);
      
      return {
        success: true,
        credentials: updatedCreds,
      };
    } catch (error: any) {
      console.error(`[QB TokenRefresh] Error refreshing token for workspace ${creds.workspaceId}:`, error);
      
      const failedAttempts = ((creds.metadata as any)?.failedRefreshAttempts || 0) + 1;
      await this.incrementFailedAttempts(creds.id, failedAttempts, creds.metadata);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  private async updateCredentials(
    id: string,
    updates: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: Date | null;
      refreshTokenExpiresAt: Date | null;
      metadata: Record<string, any> | null;
    }
  ): Promise<void> {
    try {
      // First fetch current metadata to perform deep merge
      const [current] = await db.select({ metadata: partnerConnections.metadata })
        .from(partnerConnections)
        .where(eq(partnerConnections.id, id))
        .limit(1);
      
      // Deep merge: preserve existing keys, update token refresh fields
      const existingMetadata = (current?.metadata as Record<string, any>) || {};
      const newMetadata = { 
        ...existingMetadata,
        ...(updates.metadata || {}),
        failedRefreshAttempts: 0, // Reset on success
        lastTokenRefresh: new Date().toISOString(),
      };
      
      await db.update(partnerConnections)
        .set({
          accessToken: updates.accessToken,
          refreshToken: updates.refreshToken,
          expiresAt: updates.expiresAt,
          refreshTokenExpiresAt: updates.refreshTokenExpiresAt,
          metadata: newMetadata,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(partnerConnections.id, id));
    } catch (error) {
      console.error('[QB TokenRefresh] Failed to update credentials:', error);
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
      console.error('[QB TokenRefresh] Failed to update failed attempts:', error);
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
      console.error('[QB TokenRefresh] Failed to mark connection expired:', error);
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
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
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
      console.error('[QB TokenRefresh] Error getting credentials:', error);
      return null;
    }
  }
  
  getStatus(): { isRunning: boolean; cachedCredentials: number } {
    return {
      isRunning: this.isRunning,
      cachedCredentials: this.credentialsCache.size,
    };
  }
}

export const quickbooksTokenRefresh = new QuickBooksTokenRefreshDaemon();
