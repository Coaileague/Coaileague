import crypto from 'crypto';
import { db } from '../../db';
import { partnerConnections, oauthStates } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';
import { encryptToken, decryptToken } from '../../security/tokenEncryption';

/**
 * Gusto OAuth 2.0 Service
 * 
 * Implements OAuth 2.0 authorization code flow for Gusto Payroll API
 * 
 * Required Environment Variables:
 * - GUSTO_CLIENT_ID: OAuth client ID from Gusto Developer Portal
 * - GUSTO_CLIENT_SECRET: OAuth client secret
 * - GUSTO_REDIRECT_URI: OAuth callback URL (e.g., https://yourdomain.com/api/integrations/gusto/callback)
 * 
 * Gusto OAuth Documentation:
 * https://docs.gusto.com/embedded-payroll/docs/authentication
 */

interface GustoTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export class GustoOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly authorizationEndpoint = 'https://api.gusto.com/oauth/authorize';
  private readonly tokenEndpoint = 'https://api.gusto.com/oauth/token';
  private readonly apiBaseUrl = 'https://api.gusto.com/v1';

  constructor() {
    this.clientId = process.env.GUSTO_CLIENT_ID || '';
    this.clientSecret = process.env.GUSTO_CLIENT_SECRET || '';
    this.redirectUri = process.env.GUSTO_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  Gusto OAuth not configured - missing GUSTO_CLIENT_ID or GUSTO_CLIENT_SECRET');
    }
  }

  /**
   * Generate authorization URL for user to grant access with state persistence
   * 
   * @param workspaceId - Workspace requesting authorization
   * @returns Authorization URL and state token
   */
  async generateAuthorizationUrl(workspaceId: string): Promise<{ url: string; state: string }> {
    // Generate CSRF protection state token
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in database (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await db.insert(oauthStates).values({
      workspaceId,
      partnerType: 'gusto',
      state,
      expiresAt,
    });
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
    });

    const authUrl = `${this.authorizationEndpoint}?${params.toString()}`;

    return { url: authUrl, state };
  }

  /**
   * Exchange authorization code for access tokens
   * 
   * @param code - Authorization code from callback
   * @param state - State token for CSRF validation
   */
  async exchangeCodeForTokens(
    code: string,
    state: string
  ): Promise<{ workspaceId: string; connection: any }> {
    // Validate state from database
    const [oauthState] = await db.select()
      .from(oauthStates)
      .where(
        and(
          eq(oauthStates.state, state),
          eq(oauthStates.partnerType, 'gusto')
        )
      )
      .limit(1);
    
    if (!oauthState) {
      throw new Error('Invalid or expired state token');
    }
    
    // Check expiry
    if (new Date() > oauthState.expiresAt) {
      // Clean up expired state
      await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
      throw new Error('State token expired - please try again');
    }
    
    const workspaceId = oauthState.workspaceId;

    // Exchange code for tokens
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokens: GustoTokenResponse = await response.json();

    // Clean up used state token
    await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));

    // Calculate token expiry time (Gusto tokens expire in 2 hours by default)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    
    // Gusto refresh tokens don't expire (but can be revoked)
    const refreshTokenExpiresAt = null;

    // Encrypt tokens before storage
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    // Check if connection already exists
    const existing = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'gusto')
        )
      )
      .limit(1);

    let connection;

    if (existing.length > 0) {
      // Update existing connection
      const [updated] = await db.update(partnerConnections)
        .set({
          status: 'connected',
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          refreshTokenExpiresAt,
          metadata: {
            tokenType: tokens.token_type,
            scope: tokens.scope,
          },
          lastSyncAt: now,
        })
        .where(eq(partnerConnections.id, existing[0].id))
        .returning();
      
      connection = updated;
    } else {
      // Create new connection
      const [created] = await db.insert(partnerConnections).values({
        workspaceId,
        partnerType: 'gusto',
        partnerName: 'Gusto Payroll',
        status: 'connected',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        refreshTokenExpiresAt,
        metadata: {
          tokenType: tokens.token_type,
          scope: tokens.scope,
        },
        lastSyncAt: now,
      }).returning();
      
      connection = created;
    }

    // Clean up old expired states (housekeeping)
    await db.delete(oauthStates)
      .where(lt(oauthStates.expiresAt, now));

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

    // Decrypt refresh token
    const decryptedRefreshToken = decryptToken(connection.refreshToken);
    if (!decryptedRefreshToken) {
      throw new Error('Failed to decrypt refresh token');
    }

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken,
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

    const tokens: GustoTokenResponse = await response.json();

    // Calculate new expiry time
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

    // Encrypt new tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    // Update connection with new tokens
    await db.update(partnerConnections)
      .set({
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        status: 'connected',
      })
      .where(eq(partnerConnections.id, connectionId));
  }

  /**
   * Disconnect (revoke) Gusto connection
   * 
   * @param connectionId - Partner connection ID
   */
  async disconnect(connectionId: string): Promise<void> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      throw new Error('Connection not found');
    }

    // Note: Gusto doesn't have a token revocation endpoint
    // We just mark as disconnected locally

    // Mark connection as disconnected
    await db.update(partnerConnections)
      .set({
        status: 'disconnected',
        accessToken: '',
        refreshToken: '',
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
    const isExpiringSoon = connection.expiresAt && 
      (now.getTime() + expiryBuffer) >= connection.expiresAt.getTime();

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
      
      // Decrypt and return
      return decryptToken(updated.accessToken) || '';
    }

    // Decrypt and return current token
    return decryptToken(connection.accessToken) || '';
  }
}

export const gustoOAuthService = new GustoOAuthService();
