import crypto from 'crypto';
import { db } from '../../db';
import { partnerConnections, oauthStates } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';
import { encryptToken, decryptToken } from '../../security/tokenEncryption';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';

/**
 * QuickBooks OAuth 2.0 Service — SINGLE SOURCE OF TRUTH
 * 
 * ALL QuickBooks OAuth operations go through this service. No exceptions.
 * - Authorization URL generation
 * - Token exchange
 * - Token refresh
 * - Redirect URI construction (buildRedirectUri is the ONE method)
 * - Credential selection (dev vs prod based on domain)
 * 
 * Required Secrets:
 * - QUICKBOOKS_DEV_CLIENT_ID / QUICKBOOKS_DEV_CLIENT_SECRET (sandbox)
 * - QUICKBOOKS_PROD_CLIENT_ID / QUICKBOOKS_PROD_CLIENT_SECRET (production)
 * 
 * QuickBooks OAuth Documentation:
 * https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
 */

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
  realmId: string;
}

import { INTEGRATIONS } from '@shared/platformConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksOAuth');


export class QuickBooksOAuthService {
  private readonly authorizationEndpoint = INTEGRATIONS.quickbooks.oauthUrls.authorization;
  private readonly tokenEndpoint = INTEGRATIONS.quickbooks.oauthUrls.token;
  private readonly revokeEndpoint = INTEGRATIONS.quickbooks.oauthUrls.revoke;

  private static cleanupScheduled = false;

  /**
   * GAP-40 FIX: Per-connection token refresh mutex.
   *
   * QuickBooks OAuth uses rotating refresh tokens — each refresh call produces a NEW
   * refresh token and invalidates the old one. If two concurrent requests both detect
   * an expiring token and both call refreshAccessToken(), the sequence is:
   *   1. Request A calls QB token endpoint with refresh_token_A → gets (access_B, refresh_B)
   *   2. Request B calls QB token endpoint with refresh_token_A (already rotated!) → 400 error
   *   3. Even if both succeed (race window before rotation completes), Request B overwrites
   *      Request A's refresh_B in the DB with a stale value — next refresh will fail.
   *
   * Fix: maintain a per-connectionId Promise. If a refresh is already in-flight, every
   * concurrent caller awaits the same Promise rather than starting their own. After the
   * Promise resolves (or rejects), the map entry is deleted so the next expiry cycle
   * starts fresh.
   */
  private readonly _refreshPromises = new Map<string, Promise<void>>();

  constructor() {
    log.info(`[QuickBooks OAuth] Single-service architecture initialized`);
    log.info(`[QuickBooks OAuth] Dev credentials: ${process.env.QUICKBOOKS_DEV_CLIENT_ID ? 'SET' : 'NOT SET'}`);
    log.info(`[QuickBooks OAuth] Prod credentials: ${process.env.QUICKBOOKS_PROD_CLIENT_ID ? 'SET' : 'NOT SET'}`);
  }

  /**
   * Get credentials based on request domain (auto-detect dev vs prod)
   * Uses centralized INTEGRATIONS.quickbooks.getEnvironmentForDomain
   */
  private getCredentialsForDomain(requestDomain?: string): { clientId: string; clientSecret: string; isProduction: boolean } {
    const qbEnvironment = INTEGRATIONS.quickbooks.getEnvironmentForDomain(requestDomain);
    const isProduction = qbEnvironment === 'production';
    
    if (isProduction) {
      const devId = process.env.QUICKBOOKS_PROD_CLIENT_ID || '';
      const legacyId = process.env.QUICKBOOKS_CLIENT_ID || '';
      const clientId = devId || legacyId;
      const clientSecret = process.env.QUICKBOOKS_PROD_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '';
      const source = devId ? 'QUICKBOOKS_PROD_CLIENT_ID' : (legacyId ? 'QUICKBOOKS_CLIENT_ID (legacy fallback)' : 'NONE');
      log.info(`[QuickBooks OAuth] PRODUCTION credentials for domain: ${requestDomain || 'unknown'}, source: ${source}, prefix: ${clientId.substring(0, 10)}...`);
      return { clientId, clientSecret, isProduction: true };
    } else {
      const devId = process.env.QUICKBOOKS_DEV_CLIENT_ID || '';
      const legacyId = process.env.QUICKBOOKS_CLIENT_ID || '';
      const clientId = devId || legacyId;
      const clientSecret = process.env.QUICKBOOKS_DEV_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '';
      const source = devId ? 'QUICKBOOKS_DEV_CLIENT_ID' : (legacyId ? 'QUICKBOOKS_CLIENT_ID (legacy fallback - WRONG for sandbox!)' : 'NONE');
      log.info(`[QuickBooks OAuth] SANDBOX credentials for domain: ${requestDomain || 'unknown'}, source: ${source}, prefix: ${clientId.substring(0, 10)}...`);
      if (!devId && legacyId) {
        log.warn(`[QuickBooks OAuth] WARNING: QUICKBOOKS_DEV_CLIENT_ID is empty! Falling back to QUICKBOOKS_CLIENT_ID which may be the PRODUCTION client ID. This causes redirect_uri mismatch errors!`);
      }
      return { clientId, clientSecret, isProduction: false };
    }
  }

  private async cleanupExpiredStates(): Promise<number> {
    const result = await db.delete(oauthStates)
      .where(lt(oauthStates.expiresAt, new Date()))
      .returning();
    if (result.length > 0) {
      log.info(`[QuickBooks OAuth] Cleaned up ${result.length} expired OAuth states`);
    }
    return result.length;
  }

  private async deleteWorkspaceStates(workspaceId: string): Promise<number> {
    const result = await db.delete(oauthStates)
      .where(and(
        eq(oauthStates.workspaceId, workspaceId),
        eq(oauthStates.partnerType, 'quickbooks')
      ))
      .returning();
    if (result.length > 0) {
      log.info(`[QuickBooks OAuth] Deleted ${result.length} previous OAuth states for workspace ${workspaceId}`);
    }
    return result.length;
  }

  async cleanupFailedState(state: string): Promise<void> {
    await db.delete(oauthStates)
      .where(and(
        eq(oauthStates.state, state),
        eq(oauthStates.partnerType, 'quickbooks')
      ));
  }

  /**
   * Get credentials for background operations (token refresh, revoke)
   * Uses connection metadata environment if available
   */
  private getCredentialsForBackgroundOps(connectionMetadata?: Record<string, unknown>): { clientId: string; clientSecret: string } {
    const storedEnvironment = connectionMetadata?.environment as string | undefined;
    
    let isProduction: boolean;
    if (storedEnvironment) {
      isProduction = storedEnvironment === 'production';
    } else {
      isProduction = process.env.NODE_ENV === 'production';
    }
    
    if (isProduction) {
      return {
        clientId: process.env.QUICKBOOKS_PROD_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID || '',
        clientSecret: process.env.QUICKBOOKS_PROD_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '',
      };
    } else {
      return {
        clientId: process.env.QUICKBOOKS_DEV_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID || '',
        clientSecret: process.env.QUICKBOOKS_DEV_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '',
      };
    }
  }

  /**
   * Build redirect URI — SINGLE SOURCE OF TRUTH
   *
   * Production: uses QUICKBOOKS_REDIRECT_URI env var if set, else derives
   * from the canonical host, else falls through to APP_BASE_URL.
   * Development: falls through to APP_BASE_URL (localhost).
   *
   * This is the ONE method that constructs the redirect URI.
   * No other file should construct a QuickBooks redirect URI.
   */
  buildRedirectUri(requestDomain?: string): string {
    if (process.env.NODE_ENV === 'production') {
      if (process.env.QUICKBOOKS_REDIRECT_URI) {
        return process.env.QUICKBOOKS_REDIRECT_URI;
      }
      const canonicalHost = INTEGRATIONS.quickbooks.getCanonicalHost(requestDomain);
      if (canonicalHost) {
        return `https://${canonicalHost}/api/integrations/quickbooks/callback`;
      }
    }
    return `${getAppBaseUrl()}/api/integrations/quickbooks/callback`;
  }

  /**
   * Generate authorization URL for user to grant access
   */
  async generateAuthorizationUrl(workspaceId: string, requestDomain?: string): Promise<{ url: string; state: string }> {
    await this.cleanupExpiredStates();
    await this.deleteWorkspaceStates(workspaceId);
    
    const { clientId, isProduction } = this.getCredentialsForDomain(requestDomain);
    
    if (!clientId) {
      throw new Error('QuickBooks credentials not configured. Check QUICKBOOKS_DEV_CLIENT_ID and QUICKBOOKS_PROD_CLIENT_ID in Replit Secrets.');
    }
    
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    const dynamicRedirectUri = this.buildRedirectUri(requestDomain);
    const qbEnvironment = isProduction ? 'production' : 'sandbox';
    
    log.info(`[QuickBooks OAuth] Auth URL: clientId=${clientId.substring(0, 10)}..., env=${qbEnvironment}, redirect=${dynamicRedirectUri}`);
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await db.insert(oauthStates).values({
      workspaceId,
      partnerType: 'quickbooks',
      state,
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt,
    });
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: dynamicRedirectUri,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${this.authorizationEndpoint}?${params.toString()}`;

    log.info(`[QuickBooks OAuth] FULL AUTH URL: ${authUrl}`);
    log.info(`[QuickBooks OAuth] redirect_uri param value: ${dynamicRedirectUri}`);

    return { url: authUrl, state };
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(
    code: string,
    state: string,
    realmId: string,
    requestDomain?: string
  ): Promise<{ workspaceId: string; connection: any }> {
    await this.cleanupExpiredStates();
    
    const [oauthState] = await db.select()
      .from(oauthStates)
      .where(
        and(
          eq(oauthStates.state, state),
          eq(oauthStates.partnerType, 'quickbooks')
        )
      )
      .limit(1);
    
    if (!oauthState) {
      throw new Error('Invalid or expired state token');
    }
    
    if (new Date() > oauthState.expiresAt) {
      await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
      throw new Error('State token expired - please try again');
    }
    
    const workspaceId = oauthState.workspaceId;
    const { clientId, clientSecret, isProduction } = this.getCredentialsForDomain(requestDomain);
    const qbEnvironment = isProduction ? 'production' : 'sandbox';
    const dynamicRedirectUri = this.buildRedirectUri(requestDomain);
    
    log.info(`[QuickBooks OAuth] Token exchange: env=${qbEnvironment}, redirect=${dynamicRedirectUri}`);

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: dynamicRedirectUri,
    });
    
    if (oauthState.codeVerifier) {
      tokenBody.set('code_verifier', oauthState.codeVerifier);
    }
    
    let response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: tokenBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn(`[QuickBooks OAuth] Basic auth failed (${response.status}): ${errorText}`);
      
      const bodyWithCredentials = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: dynamicRedirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      
      if (oauthState.codeVerifier) {
        bodyWithCredentials.set('code_verifier', oauthState.codeVerifier);
      }
      
      response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyWithCredentials,
      });
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`[QuickBooks OAuth] Token exchange failed (${response.status}): ${error}`);
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokens: QuickBooksTokenResponse = await response.json();

    await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000);

    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    const existing = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    let connection;

    if (existing.length > 0) {
      const [updated] = await db.update(partnerConnections)
        .set({
          status: 'connected',
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          refreshTokenExpiresAt,
          realmId,
          metadata: {
            companyId: realmId,
            tokenType: tokens.token_type,
            environment: qbEnvironment,
          },
          lastSyncAt: now,
        })
        .where(eq(partnerConnections.id, existing[0].id))
        .returning();
      
      connection = updated;
    } else {
      const [created] = await db.insert(partnerConnections).values({
        workspaceId,
        partnerType: 'quickbooks',
        partnerName: 'QuickBooks Online',
        status: 'connected',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        refreshTokenExpiresAt,
        realmId,
        metadata: {
          companyId: realmId,
          tokenType: tokens.token_type,
          environment: qbEnvironment,
        },
        lastSyncAt: now,
      }).returning();
      
      connection = created;
    }

    await db.delete(oauthStates)
      .where(lt(oauthStates.expiresAt, now));

    return { workspaceId, connection };
  }

  async refreshAccessToken(connectionId: string): Promise<void> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.refreshToken) {
      throw new Error('Connection not found or refresh token missing');
    }

    if (connection.refreshTokenExpiresAt && new Date() > connection.refreshTokenExpiresAt) {
      await db.update(partnerConnections)
        .set({ status: 'expired' })
        .where(eq(partnerConnections.id, connectionId));
      throw new Error('Refresh token expired - user must reconnect');
    }

    const decryptedRefreshToken = decryptToken(connection.refreshToken);
    if (!decryptedRefreshToken) {
      throw new Error('Failed to decrypt refresh token');
    }
    
    const connectionMetadata = connection.metadata as Record<string, any> | null;
    const { clientId, clientSecret } = this.getCredentialsForBackgroundOps(connectionMetadata || undefined);

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      
      if (response.status === 400 || response.status === 401) {
        await db.update(partnerConnections)
          .set({ status: 'expired' })
          .where(eq(partnerConnections.id, connectionId));
        throw new Error('Refresh token invalid - user must reconnect');
      }
      
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const tokens: QuickBooksTokenResponse = await response.json();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000);

    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    await db.update(partnerConnections)
      .set({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        refreshTokenExpiresAt,
        status: 'connected',
      })
      .where(eq(partnerConnections.id, connectionId));
  }

  async disconnect(connectionId: string): Promise<void> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.refreshToken) {
      throw new Error('Connection not found');
    }

    try {
      const decryptedRefreshToken = decryptToken(connection.refreshToken);
      if (decryptedRefreshToken) {
        const connectionMetadata = connection.metadata as Record<string, any> | null;
        const { clientId, clientSecret } = this.getCredentialsForBackgroundOps(connectionMetadata || undefined);
        
        const response = await fetch(this.revokeEndpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            token: decryptedRefreshToken,
          }),
        });

        if (!response.ok) {
          log.error('[QuickBooks OAuth] Failed to revoke tokens:', await response.text());
        }
      }
    } catch (error) {
      log.error('[QuickBooks OAuth] Error revoking tokens:', error);
    }

    await db.update(partnerConnections)
      .set({
        status: 'disconnected',
        accessToken: '',
        refreshToken: '',
      })
      .where(eq(partnerConnections.id, connectionId));
  }

  getDecryptedAccessToken(connectionId: string): string | null {
    return this.getCachedDecryptedToken(connectionId);
  }

  private cachedTokens: Map<string, { token: string; fetchedAt: number }> = new Map();

  private getCachedDecryptedToken(connectionId: string): string | null {
    const cached = this.cachedTokens.get(connectionId);
    const now = Date.now();
    if (cached && (now - cached.fetchedAt) < 30000) {
      return cached.token;
    }
    return null;
  }

  async getDecryptedAccessTokenAsync(connectionId: string): Promise<string | null> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.accessToken) {
      return null;
    }

    const decrypted = decryptToken(connection.accessToken);
    if (decrypted) {
      this.cachedTokens.set(connectionId, { token: decrypted, fetchedAt: Date.now() });
    }
    return decrypted;
  }

  async getValidAccessToken(connectionId: string): Promise<string> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.accessToken) {
      throw new Error('Connection not found or access token missing');
    }

    const expiryBuffer = 5 * 60 * 1000;
    const now = new Date();
    const isExpiringSoon = connection.expiresAt && 
      (now.getTime() + expiryBuffer) >= connection.expiresAt.getTime();

    if (isExpiringSoon) {
      // GAP-40 FIX: Coalesce concurrent refresh calls into a single Promise so only one
      // thread calls the QB token endpoint for this connection at a time.
      let refreshPromise = this._refreshPromises.get(connectionId);
      if (!refreshPromise) {
        refreshPromise = this.refreshAccessToken(connectionId).finally(() => {
          this._refreshPromises.delete(connectionId);
        });
        this._refreshPromises.set(connectionId, refreshPromise);
      }
      await refreshPromise;

      const [updated] = await db.select()
        .from(partnerConnections)
        .where(eq(partnerConnections.id, connectionId))
        .limit(1);
      
      if (!updated?.accessToken) {
        throw new Error('Failed to refresh access token');
      }
      
      return decryptToken(updated.accessToken) || '';
    }

    return decryptToken(connection.accessToken) || '';
  }

  startScheduledCleanup(): void {
    if (QuickBooksOAuthService.cleanupScheduled) {
      return;
    }
    QuickBooksOAuthService.cleanupScheduled = true;
    
    const ONE_HOUR_MS = 60 * 60 * 1000;
    
    // Defer first cleanup 120s — probes DB before running to avoid circuit-open storms
    setTimeout(async () => {
      try {
        const { probeDbConnection } = await import('../../db');
        const dbOk = await probeDbConnection();
        if (!dbOk) {
          log.warn('[QuickBooks OAuth] Skipping startup cleanup — DB probe failed');
          return;
        }
        await this.cleanupExpiredStates();
      } catch (err: unknown) {
        log.warn('[QuickBooks OAuth] Startup cleanup error:', err?.message || err);
      }
    }, 120000);
    
    setInterval(async () => {
      try {
        await this.cleanupExpiredStates();
      } catch (error) {
        log.warn('[QuickBooks OAuth] Scheduled cleanup error:', (error as Error)?.message || error);
      }
    }, ONE_HOUR_MS).unref();
    
    log.info(`[QuickBooks OAuth] Scheduled cleanup started (hourly)`);
  }
}

export const quickbooksOAuthService = new QuickBooksOAuthService();
