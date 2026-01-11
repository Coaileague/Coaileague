import crypto from 'crypto';
import { db } from '../../db';
import { partnerConnections, oauthStates } from '@shared/schema';
import { eq, and, lt } from 'drizzle-orm';
import { encryptToken, decryptToken } from '../../security/tokenEncryption';

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

import { INTEGRATIONS } from '@shared/platformConfig';

export class QuickBooksOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  // Use centralized config - NO HARDCODED VALUES
  private readonly authorizationEndpoint = INTEGRATIONS.quickbooks.oauthUrls.authorization;
  private readonly tokenEndpoint = INTEGRATIONS.quickbooks.oauthUrls.token;
  private readonly revokeEndpoint = INTEGRATIONS.quickbooks.oauthUrls.revoke;
  private readonly apiBaseUrl = INTEGRATIONS.quickbooks.getVersionedApiBase();

  constructor() {
    this.clientId = process.env.QUICKBOOKS_CLIENT_ID || '';
    this.clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET || '';
    
    // Build redirect URI dynamically from Replit environment or use explicit setting
    if (process.env.QUICKBOOKS_REDIRECT_URI) {
      this.redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
    } else if (process.env.REPLIT_DOMAINS) {
      // Replit domains (primary domain is first)
      const primaryDomain = process.env.REPLIT_DOMAINS.split(',')[0];
      this.redirectUri = `https://${primaryDomain}/api/integrations/quickbooks/callback`;
    } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      // Replit deployment URL pattern (legacy)
      this.redirectUri = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/api/integrations/quickbooks/callback`;
    } else {
      this.redirectUri = '';
    }

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  QuickBooks OAuth not configured - missing QUICKBOOKS_CLIENT_ID or QUICKBOOKS_CLIENT_SECRET');
    }
    
    if (this.redirectUri) {
      console.log(`[QuickBooks OAuth] Redirect URI: ${this.redirectUri}`);
    }
  }

  /**
   * Generate authorization URL for user to grant access with PKCE
   * 
   * @param workspaceId - Workspace requesting authorization
   * @returns Authorization URL and state token
   */
  async generateAuthorizationUrl(workspaceId: string): Promise<{ url: string; state: string }> {
    // Generate CSRF protection state token
    const state = crypto.randomBytes(32).toString('hex');
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    // Store state and PKCE verifier in database (expires in 10 minutes)
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
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting', // Full accounting scope
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${this.authorizationEndpoint}?${params.toString()}`;

    return { url: authUrl, state };
  }

  /**
   * Exchange authorization code for access tokens with PKCE
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
    // Validate state and get PKCE verifier from database
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
    
    // Check expiry
    if (new Date() > oauthState.expiresAt) {
      // Clean up expired state
      await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
      throw new Error('State token expired - please try again');
    }
    
    const workspaceId = oauthState.workspaceId;

    // Exchange code for tokens with PKCE
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
        code_verifier: oauthState.codeVerifier || '',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokens: QuickBooksTokenResponse = await response.json();

    // Clean up used state token
    await db.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));

    // Calculate token expiry times
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000);

    // Encrypt tokens before storage
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

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
          status: 'connected',
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          refreshTokenExpiresAt,
          realmId,
          metadata: {
            companyId: realmId,
            tokenType: tokens.token_type,
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

    // Check if refresh token is expired
    if (connection.refreshTokenExpiresAt && new Date() > connection.refreshTokenExpiresAt) {
      // Refresh token expired - mark connection as expired
      await db.update(partnerConnections)
        .set({ status: 'expired' })
        .where(eq(partnerConnections.id, connectionId));
      
      throw new Error('Refresh token expired - user must reconnect');
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
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
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

    const tokens: QuickBooksTokenResponse = await response.json();

    // Calculate new expiry times
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(now.getTime() + tokens.x_refresh_token_expires_in * 1000);

    // Encrypt new tokens
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    // Update connection with new tokens
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

    // Decrypt and revoke tokens with QuickBooks
    try {
      const decryptedRefreshToken = decryptToken(connection.refreshToken);
      if (!decryptedRefreshToken) {
        console.warn('Could not decrypt refresh token for revocation');
      } else {
        const response = await fetch(this.revokeEndpoint, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            token: decryptedRefreshToken,
          }),
        });

        if (!response.ok) {
          console.error('Failed to revoke QuickBooks tokens:', await response.text());
          // Continue anyway - we'll mark as disconnected locally
        }
      }
    } catch (error) {
      console.error('Error revoking QuickBooks tokens:', error);
      // Continue anyway
    }

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

export const quickbooksOAuthService = new QuickBooksOAuthService();
