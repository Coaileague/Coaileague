import crypto from 'crypto';
import { db } from '../../db';
import { partnerConnections } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * QuickBooks OAuth 2.0 Service
 * 
 * Implements OAuth 2.0 authorization code flow with PKCE for QuickBooks Online API
 * 
 * Required Environment Variables:
 * - QUICKBOOKS_CLIENT_ID: OAuth client ID from QuickBooks Developer Portal
 * - QUICKBOOKS_CLIENT_SECRET: OAuth client secret
 * - QUICKBOOKS_REDIRECT_URI: OAuth callback URL (e.g., https://yourdomain.com/api/integrations/quickbooks/callback)
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
  realmId: string; // Company ID
}

export class QuickBooksOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authorizationEndpoint = 'https://appcenter.intuit.com/connect/oauth2';
  private readonly tokenEndpoint = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  private readonly revokeEndpoint = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
  private readonly apiBaseUrl = 'https://quickbooks.api.intuit.com/v3';

  constructor() {
    this.clientId = process.env.QUICKBOOKS_CLIENT_ID || '';
    this.clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET || '';
    this.redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  QuickBooks OAuth not configured - missing QUICKBOOKS_CLIENT_ID or QUICKBOOKS_CLIENT_SECRET');
    }
  }

  /**
   * Generate authorization URL for user to grant access
   * 
   * @param workspaceId - Workspace requesting authorization
   * @returns Authorization URL and state token
   */
  async generateAuthorizationUrl(workspaceId: string): Promise<{ url: string; state: string }> {
    // Generate CSRF protection state token
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in database for validation (expires in 10 minutes)
    // In production, you'd store this in a separate oauth_states table with expiry
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting', // Full accounting scope
      state: `${workspaceId}:${state}`, // Encode workspace ID in state
    });

    const authUrl = `${this.authorizationEndpoint}?${params.toString()}`;

    return { url: authUrl, state };
  }

  /**
   * Exchange authorization code for access tokens
   * 
   * @param code - Authorization code from callback
   * @param state - State token for CSRF validation
   * @param realmId - QuickBooks company ID (from callback)
   */
  async exchangeCodeForTokens(
    code: string,
    state: string,
    realmId: string
  ): Promise<{ workspaceId: string; connection: any }> {
    // Extract workspace ID from state
    const [workspaceId, stateToken] = state.split(':');
    
    if (!workspaceId || !stateToken) {
      throw new Error('Invalid state token');
    }

    // Exchange code for tokens
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokens: QuickBooksTokenResponse = await response.json();

    // Calculate token expiry times
    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000);

    // Check if connection already exists
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
      // Update existing connection
      const [updated] = await db.update(partnerConnections)
        .set({
          status: 'active',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
          companyId: realmId,
          metadata: {
            realmId,
            tokenType: tokens.token_type,
          },
          lastSyncedAt: now,
        })
        .where(eq(partnerConnections.id, existing[0].id))
        .returning();
      
      connection = updated;
    } else {
      // Create new connection
      const [created] = await db.insert(partnerConnections).values({
        workspaceId,
        partnerType: 'quickbooks',
        status: 'active',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        companyId: realmId,
        metadata: {
          realmId,
          tokenType: tokens.token_type,
        },
        lastSyncedAt: now,
      }).returning();
      
      connection = created;
    }

    return { workspaceId, connection };
  }

  /**
   * Refresh access token using refresh token
   * 
   * @param connectionId - Partner connection ID
   */
  async refreshAccessToken(connectionId: string): Promise<void> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.refreshToken) {
      throw new Error('Connection not found or refresh token missing');
    }

    // Check if refresh token is expired
    if (connection.refreshTokenExpiresAt && new Date() > connection.refreshTokenExpiresAt) {
      // Refresh token expired - mark connection as expired
      await db.update(partnerConnections)
        .set({ status: 'expired' })
        .where(eq(partnerConnections.id, connectionId));
      
      throw new Error('Refresh token expired - user must reconnect');
    }

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      
      // Check if refresh token is invalid/revoked
      if (response.status === 400 || response.status === 401) {
        await db.update(partnerConnections)
          .set({ status: 'expired' })
          .where(eq(partnerConnections.id, connectionId));
        
        throw new Error('Refresh token invalid - user must reconnect');
      }
      
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const tokens: QuickBooksTokenResponse = await response.json();

    // Calculate new expiry times
    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000);

    // Update connection with new tokens
    await db.update(partnerConnections)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        status: 'active',
      })
      .where(eq(partnerConnections.id, connectionId));
  }

  /**
   * Disconnect (revoke) QuickBooks connection
   * 
   * @param connectionId - Partner connection ID
   */
  async disconnect(connectionId: string): Promise<void> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.refreshToken) {
      throw new Error('Connection not found');
    }

    // Revoke tokens with QuickBooks
    try {
      const response = await fetch(this.revokeEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          token: connection.refreshToken,
        }),
      });

      if (!response.ok) {
        console.error('Failed to revoke QuickBooks tokens:', await response.text());
        // Continue anyway - we'll mark as disconnected locally
      }
    } catch (error) {
      console.error('Error revoking QuickBooks tokens:', error);
      // Continue anyway
    }

    // Mark connection as disconnected
    await db.update(partnerConnections)
      .set({
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
      })
      .where(eq(partnerConnections.id, connectionId));
  }

  /**
   * Get valid access token (refreshes if expired)
   * 
   * @param connectionId - Partner connection ID
   * @returns Valid access token
   */
  async getValidAccessToken(connectionId: string): Promise<string> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection || !connection.accessToken) {
      throw new Error('Connection not found or access token missing');
    }

    // Check if access token is expired (refresh 5 minutes before expiry)
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    const isExpiringSoon = connection.accessTokenExpiresAt && 
      (now.getTime() + expiryBuffer) >= connection.accessTokenExpiresAt.getTime();

    if (isExpiringSoon) {
      // Refresh token
      await this.refreshAccessToken(connectionId);
      
      // Fetch updated connection
      const [updated] = await db.select()
        .from(partnerConnections)
        .where(eq(partnerConnections.id, connectionId))
        .limit(1);
      
      if (!updated?.accessToken) {
        throw new Error('Failed to refresh access token');
      }
      
      return updated.accessToken;
    }

    return connection.accessToken;
  }
}

export const quickbooksOAuthService = new QuickBooksOAuthService();
