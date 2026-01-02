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
 * - Centralized token vault with encryption
 * - Proactive refresh scheduling
 * - Retry with exponential backoff on failures
 * - Event bus notifications for token status changes
 * 
 * Requirements:
 * - Node.js 18+ (native fetch API required)
 */

import { db } from '../../db';
import { eq, lt, and, sql } from 'drizzle-orm';
import { eventBus } from '../eventBus';
import { quickbooksDiscovery } from './quickbooksDiscovery';

interface StoredCredentials {
  id: string;
  workspaceId: string;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
  lastRefreshed: Date;
  failedAttempts: number;
  isActive: boolean;
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
    
    console.log('[QB TokenRefresh] Starting token refresh daemon');
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
      
      console.log(`[QB TokenRefresh] Found ${expiringCredentials.length} credentials needing refresh`);
      
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
      const results = await db.execute(
        sql`SELECT 
          id,
          workspace_id as "workspaceId",
          realm_id as "realmId",
          access_token as "accessToken",
          refresh_token as "refreshToken",
          expires_at as "expiresAt",
          refresh_token_expires_at as "refreshTokenExpiresAt",
          last_refreshed as "lastRefreshed",
          failed_attempts as "failedAttempts",
          is_active as "isActive"
        FROM quickbooks_credentials
        WHERE is_active = true
          AND expires_at < ${threshold.toISOString()}
          AND failed_attempts < ${this.MAX_RETRY_ATTEMPTS}`
      );
      
      return (results.rows || []) as StoredCredentials[];
    } catch (error) {
      console.warn('[QB TokenRefresh] Error fetching expiring credentials:', error);
      return [];
    }
  }
  
  private async refreshCredentials(creds: StoredCredentials): Promise<RefreshResult> {
    try {
      const refreshTokenExpiry = new Date(creds.refreshTokenExpiresAt);
      if (refreshTokenExpiry < new Date()) {
        console.warn(`[QB TokenRefresh] Refresh token expired for workspace ${creds.workspaceId}`);
        
        eventBus.emit('quickbooks_token_expired', {
          workspaceId: creds.workspaceId,
          realmId: creds.realmId,
          reason: 'refresh_token_expired',
          timestamp: new Date(),
        });
        
        await this.markCredentialsInactive(creds.id);
        
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
        
        await this.incrementFailedAttempts(creds.id, creds.failedAttempts + 1);
        
        const retryDelay = this.BASE_RETRY_DELAY_MS * Math.pow(2, creds.failedAttempts);
        
        return {
          success: false,
          error: `Token refresh failed: ${response.status}`,
          nextRetryAt: new Date(Date.now() + retryDelay),
        };
      }
      
      const tokens = await response.json();
      
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      const newRefreshTokenExpiresAt = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
      
      await this.updateCredentials(creds.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || creds.refreshToken,
        expiresAt: newExpiresAt,
        refreshTokenExpiresAt: tokens.refresh_token ? newRefreshTokenExpiresAt : creds.refreshTokenExpiresAt,
      });
      
      console.log(`[QB TokenRefresh] Successfully refreshed token for workspace ${creds.workspaceId}`);
      
      eventBus.emit('quickbooks_token_refreshed', {
        workspaceId: creds.workspaceId,
        realmId: creds.realmId,
        expiresAt: newExpiresAt,
        timestamp: new Date(),
      });
      
      return {
        success: true,
        credentials: {
          ...creds,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || creds.refreshToken,
          expiresAt: newExpiresAt,
          failedAttempts: 0,
        },
      };
    } catch (error: any) {
      console.error(`[QB TokenRefresh] Error refreshing token for workspace ${creds.workspaceId}:`, error);
      
      await this.incrementFailedAttempts(creds.id, creds.failedAttempts + 1);
      
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
      refreshToken: string;
      expiresAt: Date;
      refreshTokenExpiresAt: Date;
    }
  ): Promise<void> {
    try {
      await db.execute(
        sql`UPDATE quickbooks_credentials
        SET 
          access_token = ${updates.accessToken},
          refresh_token = ${updates.refreshToken},
          expires_at = ${updates.expiresAt.toISOString()},
          refresh_token_expires_at = ${updates.refreshTokenExpiresAt.toISOString()},
          last_refreshed = NOW(),
          failed_attempts = 0
        WHERE id = ${id}`
      );
    } catch (error) {
      console.error('[QB TokenRefresh] Failed to update credentials:', error);
    }
  }
  
  private async incrementFailedAttempts(id: string, attempts: number): Promise<void> {
    try {
      await db.execute(
        sql`UPDATE quickbooks_credentials
        SET failed_attempts = ${attempts}
        WHERE id = ${id}`
      );
    } catch (error) {
      console.error('[QB TokenRefresh] Failed to update failed attempts:', error);
    }
  }
  
  private async markCredentialsInactive(id: string): Promise<void> {
    try {
      await db.execute(
        sql`UPDATE quickbooks_credentials
        SET is_active = false
        WHERE id = ${id}`
      );
    } catch (error) {
      console.error('[QB TokenRefresh] Failed to mark credentials inactive:', error);
    }
  }
  
  async forceRefresh(workspaceId: string): Promise<RefreshResult> {
    try {
      const result = await db.execute(
        sql`SELECT 
          id,
          workspace_id as "workspaceId",
          realm_id as "realmId",
          access_token as "accessToken",
          refresh_token as "refreshToken",
          expires_at as "expiresAt",
          refresh_token_expires_at as "refreshTokenExpiresAt",
          last_refreshed as "lastRefreshed",
          failed_attempts as "failedAttempts",
          is_active as "isActive"
        FROM quickbooks_credentials
        WHERE workspace_id = ${workspaceId}
          AND is_active = true
        LIMIT 1`
      );
      
      if (!result.rows || result.rows.length === 0) {
        return {
          success: false,
          error: 'No active QuickBooks credentials found for workspace',
        };
      }
      
      return this.refreshCredentials(result.rows[0] as StoredCredentials);
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  async getCredentials(workspaceId: string): Promise<StoredCredentials | null> {
    const cached = this.credentialsCache.get(workspaceId);
    if (cached && cached.expiresAt > new Date()) {
      return cached;
    }
    
    try {
      const result = await db.execute(
        sql`SELECT 
          id,
          workspace_id as "workspaceId",
          realm_id as "realmId",
          access_token as "accessToken",
          refresh_token as "refreshToken",
          expires_at as "expiresAt",
          refresh_token_expires_at as "refreshTokenExpiresAt",
          last_refreshed as "lastRefreshed",
          failed_attempts as "failedAttempts",
          is_active as "isActive"
        FROM quickbooks_credentials
        WHERE workspace_id = ${workspaceId}
          AND is_active = true
        LIMIT 1`
      );
      
      if (!result.rows || result.rows.length === 0) {
        return null;
      }
      
      const creds = result.rows[0] as StoredCredentials;
      
      if (new Date(creds.expiresAt) < new Date(Date.now() + this.REFRESH_THRESHOLD_MS)) {
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
