import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response, RequestHandler } from 'express';
import { quickbooksOAuthService } from '../services/oauth/quickbooks';
import { gustoOAuthService } from '../services/oauth/gusto';
import { quickbooksService } from '../services/partners/quickbooks';
import { gustoService } from '../services/partners/gusto';
import { requireAuth } from '../auth';
import { requirePlatformStaff } from '../rbac';
import { db } from '../db';
import { partnerConnections, users, workspaces, quickbooksMigrationRuns, systemAuditLogs, payrollRuns } from '@shared/schema';
import { storage } from '../storage';
import { eq, and, or, sql, desc, inArray, gte, like } from 'drizzle-orm';
import { quickbooksRateLimiter } from '../services/integrations/quickbooksRateLimiter';
import { quickbooksTokenRefresh } from '../services/integrations/quickbooksTokenRefresh';
import { onboardingQuickBooksFlow } from '../services/orchestration/onboardingQuickBooksFlow';
import { platformEventBus } from '../services/platformEventBus';
import { broadcastToWorkspace } from '../websocket';

const router = Router();

import { INTEGRATIONS } from '@shared/platformConfig';
import { typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('OauthIntegrationRoutes');


const processingCallbacks = new Map<string, Promise<any>>();

// QuickBooks environment-aware base URL helper using centralized config
const getQuickBooksApiBase = () => {
  const env = INTEGRATIONS.quickbooks.getEnvironment();
  log.info(`[QuickBooks] Using ${env.toUpperCase()} environment`);
  return INTEGRATIONS.quickbooks.getCompanyApiBase();
};

/**
 * Workspace Authorization Middleware
 * 
 * Ensures the authenticated user has access to the workspace they're trying to access.
 * Prevents cross-tenant data access by validating:
 * 1. User's currentWorkspaceId matches requested workspaceId, OR
 * 2. User is the owner of the requested workspace
 * 
 * @param workspaceIdSource - Where to find workspaceId: 'body', 'params', or 'query'
 */
function requireWorkspaceMembership(
  workspaceIdSource: 'body' | 'params' | 'query' = 'body'
): RequestHandler {
  return async (req: any, res: Response, next) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized - no user session' });
      }

      // Extract workspaceId from specified source
      const workspaceId = req[workspaceIdSource]?.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'Missing workspaceId' });
      }

      // Check if user has access to this workspace
      // Method 1: Check if user's currentWorkspaceId matches
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user?.currentWorkspaceId === workspaceId) {
        // User is currently in this workspace
        return next();
      }

      // Method 2: Check if user is the owner of this workspace
      const [workspace] = await db.select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.ownerId, userId)
          )
        )
        .limit(1);

      if (workspace) {
        // User owns this workspace
        return next();
      }

      // User does not have access
      return res.status(403).json({ 
        error: 'Forbidden - you do not have access to this workspace' 
      });
    } catch (error: unknown) {
      log.error('Workspace membership check error:', error);
      return res.status(500).json({ error: 'Failed to verify workspace access' });
    }
  };
}

/**
 * Integration Routes
 * 
 * Handles OAuth flows for partner integrations (QuickBooks, Gusto)
 */

// ============================================================================
// QUICKBOOKS INTEGRATION
// ============================================================================

/**
 * GET /api/integrations/quickbooks/diagnostic
 * 
 * Public diagnostic endpoint for verifying QuickBooks configuration.
 * No authentication required - for production debugging.
 * Returns environment detection and configuration status (no secrets).
 */
router.get('/quickbooks/diagnostic', async (req: Request, res: Response) => {
  try {
    // Get request domain for dynamic environment detection
    const rawHost = req.get('host') || req.get('x-forwarded-host') || '';
    const xForwardedProto = req.get('x-forwarded-proto') || 'http';
    
    // SECURITY: Validate the host against allowlist
    const validatedHost = INTEGRATIONS.quickbooks.validateRequestHost(rawHost);
    const canonicalHost = INTEGRATIONS.quickbooks.getCanonicalHost(rawHost);
    const isHostTrusted = validatedHost !== null;
    
    // SECURITY: Detect environment based on canonical domain (not raw host)
    const qbEnvironment = INTEGRATIONS.quickbooks.getEnvironmentForDomain(canonicalHost);
    
    // Build expected redirect URI based on environment (matches buildRedirectUri logic)
    const isProductionRuntime = process.env.REPLIT_DEPLOYMENT === '1' || 
                                 process.env.NODE_ENV === 'production';
    let expectedRedirectUri: string;
    if (isProductionRuntime) {
      expectedRedirectUri = process.env.QUICKBOOKS_REDIRECT_URI || 
        `https://${canonicalHost}/api/integrations/quickbooks/callback`;
    } else {
      const devDomain = process.env.REPLIT_DEV_DOMAIN || 
                         (process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',')[0] : '');
      expectedRedirectUri = devDomain 
        ? `https://${devDomain}/api/integrations/quickbooks/callback`
        : `https://${canonicalHost}/api/integrations/quickbooks/callback`;
    }
    
    // Check configuration - show the ACTUAL credentials that would be used for the detected environment
    const actualClientId = qbEnvironment === 'production'
      ? (process.env.QUICKBOOKS_PROD_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID || '')
      : (process.env.QUICKBOOKS_DEV_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID || '');
    const actualClientSecret = qbEnvironment === 'production'
      ? (process.env.QUICKBOOKS_PROD_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '')
      : (process.env.QUICKBOOKS_DEV_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '');
    const hasClientId = !!actualClientId;
    const hasClientSecret = !!actualClientSecret;
    const clientIdPrefix = hasClientId ? actualClientId.substring(0, 10) + '...' : 'NOT SET';
    const explicitEnvironment = process.env.QUICKBOOKS_ENVIRONMENT || 'auto-detect';
    
    // Domain analysis
    const isProductionDomain = canonicalHost.includes('.replit.app') || 
      (!canonicalHost.includes('.riker.') && !canonicalHost.includes('.replit.dev') && !canonicalHost.includes('localhost'));
    const isDevDomain = canonicalHost.includes('.riker.') || canonicalHost.includes('.replit.dev');
    
    // API base for detected environment
    const apiBase = qbEnvironment === 'production' 
      ? INTEGRATIONS.quickbooks.apiUrls.production
      : INTEGRATIONS.quickbooks.apiUrls.sandbox;
    
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      
      // Environment Detection
      environment: {
        detected: qbEnvironment,
        explicit: explicitEnvironment,
        nodeEnv: process.env.NODE_ENV,
        isProductionDomain,
        isDevDomain,
      },
      
      // Request Info
      request: {
        host: rawHost,
        canonicalHost,
        isHostTrusted,
        protocol: xForwardedProto,
        fullUrl: `${xForwardedProto}://${canonicalHost}/api/integrations/quickbooks/diagnostic`,
      },
      
      // Configuration Status (no secrets)
      configuration: {
        hasClientId,
        hasClientSecret,
        clientIdPrefix,
        apiBase,
        expectedRedirectUri,
        authorizationEndpoint: INTEGRATIONS.quickbooks.oauthUrls.authorization,
        tokenEndpoint: INTEGRATIONS.quickbooks.oauthUrls.token,
      },
      
      // Visual Indicator Colors
      ui: {
        headerColor: qbEnvironment === 'production' ? '#22c55e' : '#3b82f6', // Green vs Blue
        headerLabel: qbEnvironment === 'production' ? 'PRODUCTION' : 'SANDBOX',
        headerDescription: qbEnvironment === 'production' 
          ? 'Connected to LIVE QuickBooks data' 
          : 'Connected to SANDBOX test data',
      },
      
      // Checklist Status
      readiness: {
        credentialsConfigured: hasClientId && hasClientSecret,
        environmentDetected: !!qbEnvironment,
        redirectUriReady: !!expectedRedirectUri,
        allChecksPass: hasClientId && hasClientSecret && !!qbEnvironment,
      },
      
      // Instructions
      instructions: qbEnvironment === 'sandbox' 
        ? 'Access this app from your .replit.app production URL to switch to production mode'
        : 'Production mode active - ensure Intuit Developer Portal has this redirect URI registered',
    });
  } catch (error: unknown) {
    log.error('QuickBooks diagnostic error:', error);
    return res.status(500).json({ 
      status: 'error',
      error: sanitizeError(error),
    });
  }
});

/**
 * POST /api/integrations/quickbooks/connect
 * 
 * Initiate QuickBooks OAuth connection
 */
router.post('/quickbooks/connect', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // SECURITY: Get and validate request domain using canonical host
    const rawHost = req.get('host') || req.get('x-forwarded-host') || '';
    const canonicalHost = INTEGRATIONS.quickbooks.getCanonicalHost(rawHost);
    const isHostTrusted = INTEGRATIONS.quickbooks.validateRequestHost(rawHost) !== null;
    
    // Determine environment based on canonical domain - SECURE DYNAMIC DETECTION
    const qbEnvironment = INTEGRATIONS.quickbooks.getEnvironmentForDomain(canonicalHost);
    log.info(`[QuickBooks OAuth] Request from canonical host: ${canonicalHost} (trusted: ${isHostTrusted})`);
    log.info(`[QuickBooks OAuth] Detected environment: ${qbEnvironment.toUpperCase()} mode`);
    log.info(`[QuickBooks OAuth] NODE_ENV: ${process.env.NODE_ENV}`);

    // Generate authorization URL with canonical host context
    const { url, state } = await quickbooksOAuthService.generateAuthorizationUrl(workspaceId, canonicalHost);

    // Get API base for the detected environment
    const apiBase = qbEnvironment === 'production' 
      ? INTEGRATIONS.quickbooks.apiUrls.production
      : INTEGRATIONS.quickbooks.apiUrls.sandbox;
    
    log.info(`[QuickBooks OAuth] API Base: ${apiBase}`);

    // Return URL and environment for frontend to show user
    return res.json({
      authorizationUrl: url,
      environment: qbEnvironment,
      apiBase,
      note: qbEnvironment === 'sandbox'
        ? 'Use sandbox test credentials from Intuit Developer Portal to log in'
        : 'Production mode - connecting to live QuickBooks data'
    });
  } catch (error: unknown) {
    log.error('QuickBooks connect error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to initiate QuickBooks connection' });
  }
});

/**
 * GET /api/integrations/quickbooks/callback
 * 
 * OAuth callback from QuickBooks after user grants access.
 * Returns HTML that closes the popup and notifies the parent window.
 */
router.get('/quickbooks/callback', async (req: Request, res: Response) => {
  // SECURITY: Get and validate request domain using canonical host
  const rawHost = req.get('host') || req.get('x-forwarded-host') || '';
  const canonicalHost = INTEGRATIONS.quickbooks.getCanonicalHost(rawHost);
  const isHostTrusted = INTEGRATIONS.quickbooks.validateRequestHost(rawHost) !== null;
  const qbEnvironment = INTEGRATIONS.quickbooks.getEnvironmentForDomain(canonicalHost);
  const isProduction = qbEnvironment === 'production';
  
  // Environment-specific colors: Green for production, Blue for sandbox
  const envHeaderColor = isProduction ? '#22c55e' : '#3b82f6';
  const envLabel = isProduction ? 'PRODUCTION' : 'SANDBOX';
  
  // Helper to send popup-closing HTML response with environment indicator
  const sendPopupResponse = (success: boolean, message: string, companyName?: string) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>${success ? 'Connected' : 'Connection Failed'} - QuickBooks</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: ${success ? '#f0fdf4' : '#fef2f2'};
      color: ${success ? '#166534' : '#991b1b'};
    }
    .env-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: ${envHeaderColor};
      color: white;
      padding: 8px 16px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .icon { font-size: 64px; margin-bottom: 16px; }
    .message { font-size: 20px; text-align: center; max-width: 320px; font-weight: 500; }
    .closing { font-size: 14px; color: #6b7280; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="env-header">QUICKBOOKS ${envLabel}</div>
  <div class="icon">${success ? '✓' : '✕'}</div>
  <div class="message">${message}</div>
  <div class="closing">This window will close automatically...</div>
  <script>
    // Notify parent window and close popup
    if (window.opener) {
      window.opener.postMessage({
        type: 'quickbooks-oauth-complete',
        success: ${success},
        message: ${JSON.stringify(message)},
        companyName: ${JSON.stringify(companyName || null)}
      }, '*');
    }
    // Close popup after a brief delay so user sees the result
    setTimeout(function() {
      window.close();
    }, 1500);
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  };

  try {
    const { code, state, realmId, error } = req.query;

    // Handle OAuth errors (user denied, etc.)
    if (error) {
      // Clean up the failed OAuth state to prevent accumulation
      if (state) {
        await quickbooksOAuthService.cleanupFailedState(state as string);
      }
      return sendPopupResponse(false, `Authorization failed: ${error}`);
    }

    if (!code || !state || !realmId) {
      // Clean up the failed OAuth state if present
      if (state) {
        await quickbooksOAuthService.cleanupFailedState(state as string);
      }
      return sendPopupResponse(false, 'Missing required parameters from QuickBooks');
    }

    // DIAGNOSTIC: Log exactly what the callback sees before token exchange
    log.info(`[QB Callback] rawHost from request: '${rawHost}'`);
    log.info(`[QB Callback] canonicalHost: '${canonicalHost}'`);
    log.info(`[QB Callback] getEnvironmentForDomain result: ${INTEGRATIONS.quickbooks.getEnvironmentForDomain(canonicalHost)}`);
    log.info(`[QB Callback] isHostTrusted: ${isHostTrusted}`);
    log.info(`[QB Callback] REPLIT_DEV_DOMAIN: '${process.env.REPLIT_DEV_DOMAIN || 'NOT SET'}'`);
    log.info(`[QB Callback] REPLIT_DOMAINS first: '${(process.env.REPLIT_DOMAINS || '').split(',')[0]}'`);
    log.info(`[QB Callback] code: ${(code as string)?.substring(0, 15)}... (${(code as string)?.length} chars)`);
    log.info(`[QB Callback] state: ${(state as string)?.substring(0, 15)}...`);
    log.info(`[QB Callback] realmId: ${realmId}`);

    const stateKey = state as string;

    // IDEMPOTENCY: If we're already processing this state, wait for the original request
    if (processingCallbacks.has(stateKey)) {
      log.info('[QuickBooks Callback] Duplicate request detected, waiting for original...');
      try {
        const result = await processingCallbacks.get(stateKey);
        return sendPopupResponse(true, 'Successfully connected to QuickBooks!', result?.connection?.companyName);
      } catch (err: unknown) {
        return sendPopupResponse(false, (err instanceof Error ? err.message : String(err)) || 'Failed to connect to QuickBooks');
      }
    }

    // Create promise for this request and store it so duplicates can await it
    const exchangePromise = quickbooksOAuthService.exchangeCodeForTokens(
      code as string,
      stateKey,
      realmId as string,
      canonicalHost
    );
    processingCallbacks.set(stateKey, exchangePromise);

    try {
      const { workspaceId, connection } = await exchangePromise;

      // CANONICAL: publish() so OnboardingQBFlow-OAuthComplete subscriber fires
      // userId: undefined is intentional — OAuth callback is an Intuit redirect without session context
      platformEventBus.publish({
        type: 'quickbooks_oauth_complete',
        category: 'automation',
        title: 'QuickBooks OAuth Complete',
        description: `QuickBooks connected for workspace ${workspaceId}${connection?.companyName ? ` — ${connection.companyName}` : ''}`,
        workspaceId,
        // payload matches what OnboardingQBFlow-OAuthComplete subscriber destructures
        payload: {
          workspaceId,
          userId: undefined,
          connectionId: connection?.id,
          realmId: realmId as string,
          companyName: connection?.companyName,
          environment: qbEnvironment,
        },
        metadata: {
          connectionId: connection?.id,
          realmId: realmId as string,
          companyName: connection?.companyName,
          environment: qbEnvironment,
        },
      }).catch((err: unknown) => log.warn('[QBOAuth] quickbooks_oauth_complete publish failed (non-blocking):', err instanceof Error ? err.message : String(err)));

      log.info(`[QuickBooks OAuth] Published quickbooks_oauth_complete event for workspace ${workspaceId}`);

      // Clean up after 30 seconds (gives time for any late duplicate requests)
      setTimeout(() => processingCallbacks.delete(stateKey), 30000);

      return sendPopupResponse(true, 'Successfully connected to QuickBooks!', connection?.companyName);
    } catch (err) {
      processingCallbacks.delete(stateKey);
      throw err;
    }
  } catch (error: unknown) {
    log.error('QuickBooks callback error:', error);
    const { state } = req.query;
    if (state) {
      await quickbooksOAuthService.cleanupFailedState(state as string).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }
    return sendPopupResponse(false, sanitizeError(error) || 'Failed to connect to QuickBooks');
  }
});

/**
 * POST /api/integrations/quickbooks/disconnect
 * 
 * Disconnect QuickBooks integration
 */
router.post('/quickbooks/disconnect', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Find connection
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({ error: 'QuickBooks connection not found' });
    }

    // Disconnect
    await quickbooksOAuthService.disconnect(connection.id);

    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('QuickBooks disconnect error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to disconnect QuickBooks' });
  }
});

/**
 * POST /api/integrations/quickbooks/refresh
 * 
 * Manually refresh QuickBooks access token
 */
router.post('/quickbooks/refresh', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Find connection
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({ error: 'QuickBooks connection not found' });
    }

    // Refresh token
    await quickbooksOAuthService.refreshAccessToken(connection.id);

    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('QuickBooks refresh error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to refresh QuickBooks token' });
  }
});

/**
 * GET /api/integrations/quickbooks/preview
 * 
 * Preview employees and customers from QuickBooks for selective import
 */
router.get('/quickbooks/preview', requireAuth, requireWorkspaceMembership('query'), async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Find connection
    const [connection] = await db.select()
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
      log.info('[QuickBooks Preview] No connection found for workspace:', workspaceId);
      return res.status(404).json({ error: 'QuickBooks not connected' });
    }

    // Get valid access token
    const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
    const realmId = connection.realmId!;
    const apiBase = getQuickBooksApiBase();
    const qbEnvironment = INTEGRATIONS.quickbooks.getEnvironment();
    
    // STEP 1: Test with CompanyInfo query first (should ALWAYS return data if connected)
    const companyInfoQuery = encodeURIComponent('select * from CompanyInfo');
    const companyInfoUrl = `${apiBase}/${realmId}/query?query=${companyInfoQuery}`;
    
    const companyInfoResponse = await fetch(companyInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    log.info('[QuickBooks Preview] CompanyInfo response status:', companyInfoResponse.status);
    if (!companyInfoResponse.ok) {
      const errorText = await companyInfoResponse.text();
      log.error('[QuickBooks Preview] CompanyInfo ERROR:', errorText);
      // If CompanyInfo fails, it means the connection is broken
      return res.status(401).json({ 
        error: 'QuickBooks connection invalid', 
        details: `CompanyInfo query failed with status ${companyInfoResponse.status}`,
        debugInfo: {
          environment: qbEnvironment,
          apiBase,
          realmId,
          status: companyInfoResponse.status,
          errorMessage: errorText.substring(0, 500),
        }
      });
    }
    
    const companyData = await companyInfoResponse.json();
    const companyName = companyData.QueryResponse?.CompanyInfo?.[0]?.CompanyName || 'Unknown Company';
    log.info('[QuickBooks Preview] Successfully connected to company:', companyName);

    // Fetch employees (all, not just active, for complete view)
    const employeeQuery = encodeURIComponent('select * from Employee MAXRESULTS 100');
    const employeeUrl = `${apiBase}/${realmId}/query?query=${employeeQuery}`;
    log.info('[QuickBooks Preview] Fetching employees from:', employeeUrl);
    
    const employeeResponse = await fetch(employeeUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    log.info('[QuickBooks Preview] Employee response status:', employeeResponse.status);
    
    let employees: any[] = [];
    if (employeeResponse.ok) {
      const empData = await employeeResponse.json();
      log.info('[QuickBooks Preview] Raw employee count:', empData.QueryResponse?.Employee?.length || 0);
      const { testing } = INTEGRATIONS.quickbooks;
      // Detect sandbox from env var (connection doesn't store environment field)
      const isSandbox = INTEGRATIONS.quickbooks.getEnvironment() === 'sandbox';
      
      employees = (empData.QueryResponse?.Employee || []).map((e: any, index: number) => {
        // Get pay rate from QuickBooks if available
        let payRate = e.BillRate || e.CostRate || null;
        
        // For sandbox testing: generate consistent pay rates when QB doesn't provide them
        // This allows end-to-end testing without requiring QB Payroll subscription
        if (!payRate && isSandbox) {
          // Generate deterministic rate based on employee ID for consistency
          const seed = parseInt(e.Id || index, 10);
          const { min, max } = testing.payRateRange;
          payRate = min + ((seed * 7) % (max - min));
          payRate = Math.round(payRate * 100) / 100; // Round to 2 decimals
        }
        
        return {
          qboId: e.Id,
          displayName: e.DisplayName,
          givenName: e.GivenName || '',
          familyName: e.FamilyName || '',
          email: e.PrimaryEmailAddr?.Address || '',
          phone: e.PrimaryPhone?.FreeFormNumber || '',
          active: e.Active !== false,
          payRate,
          employeeType: e.V4IDPseudonym ? '1099' : 'W2',
          role: e.JobTitle || 'Field Staff',
        };
      });
    } else {
      const errorText = await employeeResponse.text();
      log.error('[QuickBooks Preview] Employee fetch ERROR:', employeeResponse.status, errorText);
    }

    // Fetch customers (all, not just active)
    const customerQuery = encodeURIComponent('select * from Customer MAXRESULTS 100');
    const customerUrl = `${apiBase}/${realmId}/query?query=${customerQuery}`;
    log.info('[QuickBooks Preview] Fetching customers from:', customerUrl);
    
    const customerResponse = await fetch(customerUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    log.info('[QuickBooks Preview] Customer response status:', customerResponse.status);

    let customers: any[] = [];
    if (customerResponse.ok) {
      const custData = await customerResponse.json();
      log.info('[QuickBooks Preview] Raw customer count:', custData.QueryResponse?.Customer?.length || 0);
      customers = (custData.QueryResponse?.Customer || []).map((c: any) => ({
        qboId: c.Id,
        displayName: c.DisplayName,
        companyName: c.CompanyName || c.DisplayName,
        email: c.PrimaryEmailAddr?.Address || '',
        phone: c.PrimaryPhone?.FreeFormNumber || '',
        active: c.Active !== false,
        balance: c.Balance || 0,
      }));
    } else {
      const errorText = await customerResponse.text();
      log.error('[QuickBooks Preview] Customer fetch ERROR:', customerResponse.status, errorText);
    }
    
    log.info('[QuickBooks Preview] Final counts - Employees:', employees.length, 'Customers:', customers.length);

    // Fetch invoices to calculate customer revenue
    const invoiceQuery = encodeURIComponent('select * from Invoice MAXRESULTS 500');
    const invoiceResponse = await fetch(`${apiBase}/${realmId}/query?query=${invoiceQuery}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const customerRevenue: Record<string, { total: number; count: number; lastDate: string | null }> = {};
    if (invoiceResponse.ok) {
      const invData = await invoiceResponse.json();
      const invoices = invData.QueryResponse?.Invoice || [];
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      for (const inv of invoices) {
        const custRef = inv.CustomerRef?.value;
        if (custRef) {
          if (!customerRevenue[custRef]) {
            customerRevenue[custRef] = { total: 0, count: 0, lastDate: null };
          }
          const invDate = new Date(inv.TxnDate || inv.MetaData?.CreateTime);
          if (invDate >= threeMonthsAgo) {
            customerRevenue[custRef].total += inv.TotalAmt || 0;
          }
          customerRevenue[custRef].count++;
          if (!customerRevenue[custRef].lastDate || inv.TxnDate > customerRevenue[custRef].lastDate) {
            customerRevenue[custRef].lastDate = inv.TxnDate;
          }
        }
      }
    }

    // Enrich customers with revenue data
    customers = customers.map(c => ({
      ...c,
      monthlyRevenue: Math.round((customerRevenue[c.qboId]?.total || 0) / 3),
      invoiceCount: customerRevenue[c.qboId]?.count || 0,
      lastInvoiceDate: customerRevenue[c.qboId]?.lastDate || null,
    }));

    // Fetch payroll items
    const payrollQuery = encodeURIComponent('select * from PayrollItemWage MAXRESULTS 50');
    let payrollItems: any[] = [];
    try {
      const payrollResponse = await fetch(`${apiBase}/${realmId}/query?query=${payrollQuery}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      if (payrollResponse.ok) {
        const payrollData = await payrollResponse.json();
        payrollItems = (payrollData.QueryResponse?.PayrollItemWage || []).map((p: any) => ({
          qboId: p.Id,
          name: p.Name,
          type: p.Type || 'wage',
        }));
      }
    } catch (err) {
      // Payroll items not available
    }

    // Fetch chart of accounts
    const accountQuery = encodeURIComponent('select * from Account MAXRESULTS 100');
    let chartOfAccounts: any[] = [];
    try {
      const accountResponse = await fetch(`${apiBase}/${realmId}/query?query=${accountQuery}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      if (accountResponse.ok) {
        const accData = await accountResponse.json();
        chartOfAccounts = (accData.QueryResponse?.Account || []).map((a: any) => ({
          id: a.Id,
          name: a.Name,
          type: a.AccountType,
        }));
      }
    } catch (err) {
      // Chart of accounts fetch error
    }

    return res.json({
      employees,
      customers,
      payrollItems,
      chartOfAccounts,
      connectionId: connection.id,
      companyName: connection.companyName || 'QuickBooks Company',
    });
  } catch (error: unknown) {
    log.error('QuickBooks preview error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch QuickBooks data' });
  }
});

/**
 * GET /api/integrations/quickbooks/push/status
 * 
 * Get current migration status for a workspace
 */
router.get('/quickbooks/push/status', requireAuth, requireWorkspaceMembership('query'), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.query as { workspaceId: string };

    const [activeRun] = await db.select()
      .from(quickbooksMigrationRuns)
      .where(
        and(
          eq(quickbooksMigrationRuns.workspaceId, workspaceId),
          inArray(quickbooksMigrationRuns.status, ['running', 'cancel_requested'])
        )
      )
      .orderBy(desc(quickbooksMigrationRuns.startedAt))
      .limit(1);

    if (activeRun) {
      return res.json({
        isRunning: true,
        run: activeRun,
        progress: {
          employees: { synced: activeRun.syncedEmployees, total: activeRun.totalEmployees },
          customers: { synced: activeRun.syncedCustomers, total: activeRun.totalCustomers },
        },
      });
    }

    // Get last completed run for reference
    const [lastRun] = await db.select()
      .from(quickbooksMigrationRuns)
      .where(eq(quickbooksMigrationRuns.workspaceId, workspaceId))
      .orderBy(desc(quickbooksMigrationRuns.startedAt))
      .limit(1);

    return res.json({
      isRunning: false,
      lastRun: lastRun || null,
    });
  } catch (error: unknown) {
    log.error('Migration status error:', error);
    return res.status(500).json({ error: 'Failed to get migration status' });
  }
});

/**
 * POST /api/integrations/quickbooks/push/cancel
 * 
 * Request cancellation of a running migration
 */
router.post('/quickbooks/push/cancel', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    const [activeRun] = await db.select()
      .from(quickbooksMigrationRuns)
      .where(
        and(
          eq(quickbooksMigrationRuns.workspaceId, workspaceId),
          eq(quickbooksMigrationRuns.status, 'running')
        )
      )
      .limit(1);

    if (!activeRun) {
      return res.status(404).json({ error: 'No active migration to cancel' });
    }

    await db.update(quickbooksMigrationRuns)
      .set({ 
        status: 'cancel_requested',
        cancelRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quickbooksMigrationRuns.id, activeRun.id));

    log.info(`[QuickBooks Push] Cancellation requested for run ${activeRun.id}`);

    return res.json({ 
      success: true, 
      message: 'Cancellation requested. Migration will stop after current item.',
      runId: activeRun.id,
    });
  } catch (error: unknown) {
    log.error('Migration cancel error:', error);
    return res.status(500).json({ error: 'Failed to cancel migration' });
  }
});

/**
 * POST /api/integrations/quickbooks/push/unlock
 * 
 * Unlock a stuck migration so end-user can retry
 * - End users: Can unlock their own org's stuck migrations
 * - Support staff: Can force unlock any org's migrations
 * - Trinity AI: Can force reset via AI Brain action
 */
router.post('/quickbooks/push/unlock', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, forceReset = false } = req.body;
    const userId = req.user?.id || req.session?.userId;
    const userRole = req.session?.platformRole;
    
    // Check if user is support staff (can force reset any workspace)
    const isSupportStaff = ['root_admin', 'co_admin', 'sysops'].includes(userRole);
    
    // Find stuck migrations (running or cancel_requested for > 5 minutes, or failed)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const [stuckRun] = await db.select()
      .from(quickbooksMigrationRuns)
      .where(
        and(
          eq(quickbooksMigrationRuns.workspaceId, workspaceId),
          inArray(quickbooksMigrationRuns.status, ['running', 'cancel_requested'])
        )
      )
      .orderBy(desc(quickbooksMigrationRuns.startedAt))
      .limit(1);

    if (!stuckRun) {
      return res.json({ 
        success: true, 
        message: 'No stuck migration found. You can start a new sync.',
        alreadyUnlocked: true,
      });
    }

    const runStartTime = new Date(stuckRun.startedAt!).getTime();
    const isActuallyStuck = Date.now() - runStartTime > 5 * 60 * 1000; // > 5 minutes

    // Allow unlock if: (1) migration is stuck, or (2) support staff with forceReset, or (3) explicit forceReset
    if (!isActuallyStuck && !forceReset && !isSupportStaff) {
      return res.status(400).json({
        error: 'Migration is still in progress',
        message: 'This migration started less than 5 minutes ago. Please wait or request cancellation first.',
        runId: stuckRun.id,
        elapsedSeconds: Math.floor((Date.now() - runStartTime) / 1000),
      });
    }

    // Unlock the migration by marking it as failed with unlock reason
    await db.update(quickbooksMigrationRuns)
      .set({
        status: 'failed',
        errorMessage: forceReset 
          ? `Force reset by ${isSupportStaff ? 'support staff' : 'user'} (${userId})`
          : 'Auto-unlocked: Migration was stuck',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quickbooksMigrationRuns.id, stuckRun.id));

    log.info(`[QuickBooks Push] Migration ${stuckRun.id} unlocked by user ${userId} (forceReset: ${forceReset}, isSupportStaff: ${isSupportStaff})`);

    return res.json({
      success: true,
      message: 'Migration lock cleared. You can now start a new sync.',
      unlockedRunId: stuckRun.id,
      wasStuck: isActuallyStuck,
      forceReset,
    });
  } catch (error: unknown) {
    log.error('Migration unlock error:', error);
    return res.status(500).json({ error: 'Failed to unlock migration' });
  }
});

/**
 * POST /api/integrations/quickbooks/push/factory-reset
 * 
 * Factory reset all migration state for a workspace (SUPPORT STAFF ONLY)
 * Clears all migration history and locks so end-user can start fresh
 */
router.post('/quickbooks/push/factory-reset', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, reason } = req.body;
    const userId = req.user?.id || req.session?.userId;
    const userRole = req.session?.platformRole;
    
    // Only support staff can factory reset
    const isSupportStaff = ['root_admin', 'co_admin', 'sysops'].includes(userRole);
    if (!isSupportStaff) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Factory reset requires support staff privileges. Please contact support.',
      });
    }

    // Mark all running/pending migrations as failed
    const result = await db.update(quickbooksMigrationRuns)
      .set({
        status: 'failed',
        errorMessage: `Factory reset by support staff (${userId}): ${reason || 'No reason provided'}`,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quickbooksMigrationRuns.workspaceId, workspaceId),
          inArray(quickbooksMigrationRuns.status, ['running', 'cancel_requested'])
        )
      );

    log.info(`[QuickBooks Push] Factory reset for workspace ${workspaceId} by support staff ${userId}`);

    return res.json({
      success: true,
      message: 'Factory reset complete. All migration locks cleared.',
      workspaceId,
      resetBy: userId,
      reason: reason || 'No reason provided',
    });
  } catch (error: unknown) {
    log.error('Factory reset error:', error);
    return res.status(500).json({ error: 'Failed to factory reset migrations' });
  }
});

/**
 * POST /api/integrations/quickbooks/push
 * 
 * Push CoAIleague data TO QuickBooks (reverse sync)
 * Syncs clients as Customers, employees as Employees, invoices as Invoices
 * 
 * Implements migration lock - only one migration per workspace at a time
 * 
 * FAST MODE TIERS:
 * - standard: 3 concurrent batches, batch size 25 (~10-15 seconds for 100 items)
 * - fast: 5 concurrent batches, batch size 25 (~5-8 seconds for 100 items)
 * - turbo: 8 concurrent batches, batch size 25 (~3-5 seconds for 100 items)
 */
router.post('/quickbooks/push', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  let migrationRunId: string | null = null;
  
  try {
    const { workspaceId, useSandboxData, mode = 'fast' } = req.body;
    const userId = req.user?.id || req.session?.userId;
    
    // FAST MODE configuration - parallel batch processing
    const FAST_MODE_CONFIG = {
      standard: { concurrency: 3, batchSize: 25 },
      fast: { concurrency: 5, batchSize: 25 },
      turbo: { concurrency: 8, batchSize: 25 },
    };
    const modeConfig = FAST_MODE_CONFIG[mode as keyof typeof FAST_MODE_CONFIG] || FAST_MODE_CONFIG.fast;
    log.info(`[QuickBooks Push] Using ${mode.toUpperCase()} mode: ${modeConfig.concurrency} concurrent batches, batch size ${modeConfig.batchSize}`);

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Check for existing running migration (migration lock)
    const [existingRun] = await db.select()
      .from(quickbooksMigrationRuns)
      .where(
        and(
          eq(quickbooksMigrationRuns.workspaceId, workspaceId),
          inArray(quickbooksMigrationRuns.status, ['running', 'cancel_requested'])
        )
      )
      .limit(1);

    if (existingRun) {
      const elapsedSeconds = Math.floor((Date.now() - new Date(existingRun.startedAt!).getTime()) / 1000);
      return res.status(409).json({
        error: 'Migration already in progress',
        code: 'MIGRATION_LOCKED',
        activeRun: {
          id: existingRun.id,
          status: existingRun.status,
          startedAt: existingRun.startedAt,
          elapsedSeconds,
          progress: {
            employees: { synced: existingRun.syncedEmployees, total: existingRun.totalEmployees },
            customers: { synced: existingRun.syncedCustomers, total: existingRun.totalCustomers },
          },
        },
        message: `A migration is already running (${elapsedSeconds}s elapsed). You can cancel it or wait for it to complete.`,
      });
    }

    // Find connection
    const [connection] = await db.select()
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
      return res.status(404).json({ error: 'QuickBooks not connected' });
    }

    // Get valid access token
    const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
    const realmId = connection.realmId!;
    const apiBase = getQuickBooksApiBase();

    // Determine which workspace to fetch data from
    const SANDBOX_WORKSPACE_ID = 'sandbox-quickbooks-push-workspace-00000000';
    const sourceWorkspaceId = useSandboxData ? SANDBOX_WORKSPACE_ID : workspaceId;
    
    log.info(`[QuickBooks Push] Source workspace: ${useSandboxData ? 'SANDBOX TEST DATA' : 'real workspace'}`);

    // Fetch data from CoAIleague
    const { clients, employees: dbEmployees, invoices } = await db.transaction(async (tx) => {
      const { clients, employees, invoices } = await import('@shared/schema');
      
      const clientsList = await tx.select()
        .from(clients)
        .where(eq(clients.workspaceId, sourceWorkspaceId))
        .limit(50);
      
      const employeesList = await tx.select()
        .from(employees)
        .where(eq(employees.workspaceId, sourceWorkspaceId))
        .limit(100);
      
      const invoicesList = await tx.select()
        .from(invoices)
        .where(eq(invoices.workspaceId, sourceWorkspaceId))
        .limit(50);
      
      return { clients: clientsList, employees: employeesList, invoices: invoicesList };
    });

    log.info(`[QuickBooks Push] Pushing ${dbEmployees.length} employees, ${clients.length} clients, ${invoices.length} invoices`);

    // Create migration run record
    const [migrationRun] = await db.insert(quickbooksMigrationRuns)
      .values({
        workspaceId,
        status: 'running',
        totalEmployees: dbEmployees.length,
        totalCustomers: clients.length,
        totalInvoices: invoices.length,
        initiatedBy: userId,
        metadata: { useSandboxData, sourceWorkspaceId },
      })
      .returning();
    
    migrationRunId = migrationRun.id;
    log.info(`[QuickBooks Push] Created migration run: ${migrationRunId}`);

    const results = {
      customers: { synced: 0, errors: [] as string[] },
      employees: { synced: 0, errors: [] as string[] },
      invoices: { synced: 0, errors: [] as string[] },
    };

    // Helper to check if cancellation was requested
    const checkCancellation = async (): Promise<boolean> => {
      const [run] = await db.select()
        .from(quickbooksMigrationRuns)
        .where(eq(quickbooksMigrationRuns.id, migrationRunId!))
        .limit(1);
      return run?.status === 'cancel_requested';
    };

    // Helper to update progress (batch-level updates, not per-record)
    const updateProgress = async (syncedEmployees: number, syncedCustomers: number) => {
      await db.update(quickbooksMigrationRuns)
        .set({
          syncedEmployees,
          syncedCustomers,
          updatedAt: new Date(),
        })
        .where(eq(quickbooksMigrationRuns.id, migrationRunId!));
    };

    // ========================================================================
    // FAST MODE BATCH PROCESSING - QuickBooks Batch API
    // Uses rate-limited integration service with proper semaphore control
    // ========================================================================
    const startTime = Date.now();
    
    // Simple semaphore with FIXED concurrency control
    const createSemaphore = (limit: number) => {
      let activeCount = 0;
      const queue: (() => void)[] = [];
      
      return {
        acquire: (): Promise<void> => new Promise((resolve) => {
          if (activeCount < limit) {
            activeCount++;
            resolve();
          } else {
            queue.push(resolve); // Just queue the resolve, don't increment again
          }
        }),
        release: () => {
          if (queue.length > 0) {
            // Don't decrement - we're immediately giving the slot to next waiter
            const next = queue.shift()!;
            next();
          } else {
            activeCount--;
          }
        }
      };
    };

    // Rate-limited batch executor using QuickBooks integration service
    const executeBatchWithRateLimiter = async <T>(
      items: T[],
      entity: 'Customer' | 'Employee',
      mapFn: (item: T) => any,
      lastProcessedField: 'lastProcessedCustomerId' | 'lastProcessedEmployeeId'
    ): Promise<{ synced: number; errors: string[]; lastProcessedId?: string }> => {
      if (items.length === 0) return { synced: 0, errors: [] };
      
      const semaphore = createSemaphore(modeConfig.concurrency);
      const batchErrors: string[] = [];
      let batchSynced = 0;
      let lastProcessedId: string | undefined;
      let cancelled = false;
      
      // Split into batches
      const batches: { items: T[]; index: number }[] = [];
      for (let i = 0; i < items.length; i += modeConfig.batchSize) {
        batches.push({ items: items.slice(i, i + modeConfig.batchSize), index: i });
      }
      
      log.info(`[QuickBooks Push] Processing ${items.length} ${entity}s in ${batches.length} batches (${mode} mode, concurrency=${modeConfig.concurrency})`);
      
      // Process batch with rate limiting via quickbooksRateLimiter
      const processBatch = async (batch: { items: T[]; index: number }) => {
        if (cancelled) return;
        
        // Check for cancellation before each batch
        if (await checkCancellation()) {
          cancelled = true;
          return;
        }
        
        await semaphore.acquire();
        try {
          // Use rate limiter from quickbooks integration
          const canProceed = await quickbooksRateLimiter.waitForSlot(
            realmId,
            connection.environment === 'production' ? 'production' : 'sandbox',
            0,
            30000
          );
          
          if (!canProceed) {
            batchErrors.push(`Batch ${batch.index}: Rate limit timeout`);
            return;
          }
          
          // Build batch request for QuickBooks Batch API
          const batchItems = batch.items.map((item: any, idx) => ({
            bId: `${batch.index}-${idx}`,
            operation: 'create',
            [entity]: mapFn(item),
          }));
          
          const response = await fetch(`${apiBase}/${realmId}/batch?minorversion=75`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ BatchItemRequest: batchItems }),
          });
          
          quickbooksRateLimiter.completeRequest(
            realmId,
            connection.environment === 'production' ? 'production' : 'sandbox',
            response.ok
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            log.error(`[QuickBooks Push] Batch ${batch.index} failed:`, errorText);
            batchErrors.push(`Batch ${batch.index}: ${errorText}`);
            return;
          }
          
          const result = await response.json();
          for (const item of result.BatchItemResponse || []) {
            if (item.Fault) {
              batchErrors.push(`Item ${item.bId}: ${item.Fault.Error?.[0]?.Message || 'Unknown error'}`);
            } else {
              batchSynced++;
            }
          }
          
          // Track last processed ID for resume capability
          const lastItem = batch.items[batch.items.length - 1] as any;
          lastProcessedId = lastItem?.id;
          
          log.info(`[QuickBooks Push] Batch ${batch.index} complete: ${batchSynced}/${items.length} synced`);
        } finally {
          semaphore.release();
        }
      };
      
      // Execute all batches with concurrency limit
      await Promise.all(batches.map(batch => processBatch(batch)));
      
      return { synced: batchSynced, errors: batchErrors, lastProcessedId };
    };

    // Push Customers using Batch API (FAST MODE)
    log.info(`[QuickBooks Push] Starting customer batch sync...`);
    const customerResult = await executeBatchWithRateLimiter(
      clients, 
      'Customer', 
      (client) => ({
        DisplayName: client.companyName || `${client.firstName} ${client.lastName}`,
        CompanyName: client.companyName || `${client.firstName} ${client.lastName}`,
        PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
        PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
        BillAddr: client.address ? {
          Line1: (client.address as any).street || (client.address as any).line1,
          City: (client.address as any).city,
          CountrySubDivisionCode: (client.address as any).state,
          PostalCode: (client.address as any).zip || (client.address as any).postalCode,
        } : undefined,
      }),
      'lastProcessedCustomerId'
    );
    results.customers.synced = customerResult.synced;
    results.customers.errors = customerResult.errors;
    
    // Update progress after customers with tracking data
    await db.update(quickbooksMigrationRuns)
      .set({
        syncedCustomers: results.customers.synced,
        lastProcessedCustomerId: customerResult.lastProcessedId,
        updatedAt: new Date(),
      })
      .where(eq(quickbooksMigrationRuns.id, migrationRunId!));

    // Check for cancellation before employees
    if (await checkCancellation()) {
      await db.update(quickbooksMigrationRuns)
        .set({ status: 'cancelled', finishedAt: new Date(), updatedAt: new Date() })
        .where(eq(quickbooksMigrationRuns.id, migrationRunId!));
      
      return res.json({ success: false, cancelled: true, message: 'Migration was cancelled', results });
    }

    // Push Employees using Batch API (FAST MODE)
    log.info(`[QuickBooks Push] Starting employee batch sync...`);
    const employeeResult = await executeBatchWithRateLimiter(
      dbEmployees, 
      'Employee', 
      (emp) => {
        // Parse hourly rate - sandbox employees have this set
        const hourlyRate = emp.hourlyRate ? parseFloat(String(emp.hourlyRate)) : null;
        // Use configurable default rate from platformConfig (NO HARDCODED VALUES)
        const defaultRate = INTEGRATIONS.quickbooks.testing.defaultPayRate;
        const effectiveRate = hourlyRate && hourlyRate > 0 ? hourlyRate : defaultRate;
        
        return {
          DisplayName: `${emp.firstName} ${emp.lastName}`,
          GivenName: emp.firstName,
          FamilyName: emp.lastName,
          PrimaryEmailAddr: emp.email ? { Address: emp.email } : undefined,
          PrimaryPhone: emp.phone ? { FreeFormNumber: emp.phone } : undefined,
          // Include pay rates so they're available when importing back
          BillRate: effectiveRate,
          CostRate: effectiveRate,
          BillableTime: true,
        };
      },
      'lastProcessedEmployeeId'
    );
    results.employees.synced = employeeResult.synced;
    results.employees.errors = employeeResult.errors;
    
    // Final progress update with full tracking data
    await db.update(quickbooksMigrationRuns)
      .set({
        syncedEmployees: results.employees.synced,
        syncedCustomers: results.customers.synced,
        lastProcessedEmployeeId: employeeResult.lastProcessedId,
        updatedAt: new Date(),
      })
      .where(eq(quickbooksMigrationRuns.id, migrationRunId!));
    
    const totalTime = Date.now() - startTime;
    const totalItems = clients.length + dbEmployees.length;
    const itemsPerSecond = totalItems > 0 ? (totalItems / (totalTime / 1000)).toFixed(1) : '0';
    log.info(`[QuickBooks Push] FAST MODE complete: ${totalItems} items in ${totalTime}ms (${itemsPerSecond} items/sec)`)

    // Mark migration as completed
    await db.update(quickbooksMigrationRuns)
      .set({
        status: 'completed',
        syncedEmployees: results.employees.synced,
        syncedCustomers: results.customers.synced,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quickbooksMigrationRuns.id, migrationRunId!));

    log.info(`[QuickBooks Push] Migration completed: ${migrationRunId}`);

    return res.json({
      success: true,
      message: `Pushed ${results.customers.synced} customers and ${results.employees.synced} employees to QuickBooks`,
      results,
      migrationRunId,
    });
  } catch (error: unknown) {
    log.error('QuickBooks push error:', error);
    
    // Mark migration as failed if we have a run ID
    if (migrationRunId) {
      await db.update(quickbooksMigrationRuns)
        .set({
          status: 'failed',
          errorMessage: sanitizeError(error),
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(quickbooksMigrationRuns.id, migrationRunId));
    }
    
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to push data to QuickBooks' });
  }
});

/**
 * POST /api/integrations/quickbooks/import
 * 
 * Import selected employees and customers from QuickBooks with:
 * - Transactional all-or-nothing import (rollback on failure)
 * - Pay rate validation for employees
 * - Robust duplicate detection
 */
router.post('/quickbooks/import', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, selectedEmployees, selectedCustomers, allowMissingPayRates } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    if (selectedEmployees && !Array.isArray(selectedEmployees)) {
      return res.status(400).json({ error: 'selectedEmployees must be an array' });
    }
    if (selectedCustomers && !Array.isArray(selectedCustomers)) {
      return res.status(400).json({ error: 'selectedCustomers must be an array' });
    }

    const [connection] = await db.select()
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
      return res.status(404).json({ error: 'QuickBooks not connected' });
    }

    const { employees: employeesTable, clients: clientsTable } = await import('@shared/schema');
    // Detect sandbox from env var (connection doesn't store environment field)
    const isSandbox = INTEGRATIONS.quickbooks.getEnvironment() === 'sandbox';
    const { testing } = INTEGRATIONS.quickbooks;

    // For sandbox: auto-assign pay rates to employees missing them (enables e2e testing)
    // For production: validate pay rates and warn user
    const processedEmployees = (selectedEmployees || []).map((emp: any, index: number) => {
      let payRate = emp.payRate ? parseFloat(String(emp.payRate)) : null;
      
      // Auto-assign pay rates in sandbox mode for testing
      if ((!payRate || payRate <= 0) && isSandbox) {
        const seed = parseInt(emp.qboId || index, 10);
        const { min, max } = testing.payRateRange;
        payRate = min + ((seed * 7) % (max - min));
        payRate = Math.round(payRate * 100) / 100;
      }
      
      return { ...emp, payRate };
    });

    const employeesWithMissingPayRates: { qboId: string; displayName: string }[] = [];
    // Only validate pay rates in production mode
    if (!isSandbox && processedEmployees.length > 0 && !allowMissingPayRates) {
      for (const emp of processedEmployees) {
        const payRate = emp.payRate ? parseFloat(String(emp.payRate)) : null;
        if (!payRate || payRate <= 0) {
          employeesWithMissingPayRates.push({
            qboId: String(emp.qboId || ''),
            displayName: String(emp.displayName || 'Unknown'),
          });
        }
      }
      
      if (employeesWithMissingPayRates.length > 0) {
        return res.status(400).json({
          error: 'Pay rate validation failed',
          code: 'MISSING_PAY_RATES',
          message: `${employeesWithMissingPayRates.length} employee(s) are missing pay rates. This will cause payroll calculation errors. You can either update pay rates in QuickBooks first, or proceed with "allowMissingPayRates: true" to import without rates.`,
          employeesWithMissingPayRates,
        });
      }
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const orgCode = ws?.orgCode || 'ORG';
    const prefix = orgCode.replace('ORG-', '');

    const existingEmployees = await db.select()
      .from(employeesTable)
      .where(eq(employeesTable.workspaceId, workspaceId));
    
    const existingByQboIdEmp = new Map(
      existingEmployees
        .filter(e => e.partnerEmployeeId && e.partnerType === 'quickbooks')
        .map(e => [e.partnerEmployeeId, e])
    );
    const existingByEmailEmp = new Map(
      existingEmployees
        .filter(e => e.email)
        .map(e => [e.email!.toLowerCase(), e])
    );

    const existingClients = await db.select()
      .from(clientsTable)
      .where(eq(clientsTable.workspaceId, workspaceId));
    
    const existingByQboIdClient = new Map(
      existingClients
        .filter(c => c.partnerCustomerId && c.partnerType === 'quickbooks')
        .map(c => [c.partnerCustomerId, c])
    );
    const existingByName = new Map(
      existingClients
        .filter(c => c.companyName || c.firstName || c.lastName)
        .map(c => [(c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim()).toLowerCase(), c])
    );

    let importedEmployees = 0;
    let skippedEmployees = 0;
    let importedClients = 0;
    let skippedClients = 0;
    const errors: string[] = [];
    let empCounter = existingEmployees.length;

    const employeesToInsert: any[] = [];
    const clientsToInsert: any[] = [];

    if (processedEmployees && processedEmployees.length > 0) {
      for (const emp of processedEmployees) {
        const qboId = String(emp.qboId || '').trim();
        const displayName = String(emp.displayName || '').trim();
        
        if (!qboId || !displayName) {
          errors.push(`Invalid employee data: missing qboId or displayName`);
          continue;
        }

        if (existingByQboIdEmp.has(qboId)) {
          skippedEmployees++;
          continue;
        }

        const email = String(emp.email || '').trim().toLowerCase();
        if (email && existingByEmailEmp.has(email)) {
          skippedEmployees++;
          continue;
        }

        empCounter++;
        const empNum = String(empCounter).padStart(5, '0');

        const firstName = String(emp.givenName || displayName.split(' ')[0] || 'Unknown').trim().slice(0, 100);
        const lastName = String(emp.familyName || displayName.split(' ').slice(1).join(' ') || '').trim().slice(0, 100);
        const phone = String(emp.phone || '').trim().slice(0, 20) || null;
        const payRate = emp.payRate ? parseFloat(String(emp.payRate)) : null;
        
        employeesToInsert.push({
          workspaceId,
          firstName,
          lastName,
          email: email || null,
          phone,
          employeeId: `EMP-${prefix}-${empNum}`,
          role: 'field_worker',
          onboardingStatus: 'not_started',
          status: 'active',
          partnerEmployeeId: qboId,
          partnerType: 'quickbooks',
          quickbooksEmployeeId: qboId,
          payRate: payRate ? String(payRate) : null,
        });
        
        existingByQboIdEmp.set(qboId, {} as any);
        if (email) existingByEmailEmp.set(email, {} as any);
        
        importedEmployees++;
      }
    }

    if (selectedCustomers && selectedCustomers.length > 0) {
      for (const cust of selectedCustomers) {
        const qboId = String(cust.qboId || '').trim();
        const companyName = String(cust.companyName || cust.displayName || '').trim();
        
        if (!qboId || !companyName) {
          errors.push(`Invalid client data: missing qboId or name`);
          continue;
        }

        if (existingByQboIdClient.has(qboId)) {
          skippedClients++;
          continue;
        }

        if (existingByName.has(companyName.toLowerCase())) {
          skippedClients++;
          continue;
        }

        const email = String(cust.email || '').trim().slice(0, 255) || null;
        const phone = String(cust.phone || '').trim().slice(0, 20) || null;
        
        // Extract first/last name from displayName or use company name as fallback
        // QB customers are often companies so we split displayName or use company name
        const displayName = String(cust.displayName || companyName || '').trim();
        const nameParts = displayName.split(' ');
        const clientFirstName = String(nameParts[0] || companyName || 'Client').trim().slice(0, 100);
        const clientLastName = String(nameParts.slice(1).join(' ') || 'Account').trim().slice(0, 100) || 'Account';

        clientsToInsert.push({
          workspaceId,
          firstName: clientFirstName,
          lastName: clientLastName,
          companyName: companyName.slice(0, 255),
          email,
          phone,
          status: 'active',
          partnerCustomerId: qboId,
          partnerType: 'quickbooks',
          quickbooksClientId: qboId,
        });
        
        existingByQboIdClient.set(qboId, {} as any);
        existingByName.set(companyName.toLowerCase(), {} as any);
        
        importedClients++;
      }
    }

    if (employeesToInsert.length === 0 && clientsToInsert.length === 0) {
      return res.json({
        success: true,
        importedEmployees: 0,
        skippedEmployees,
        importedClients: 0,
        skippedClients,
        totalEmployees: skippedEmployees,
        totalClients: skippedClients,
        message: 'All records were duplicates or invalid - no new records to import',
      });
    }

    try {
      await db.transaction(async (tx) => {
        if (employeesToInsert.length > 0) {
          await tx.insert(employeesTable).values(employeesToInsert);
        }
        if (clientsToInsert.length > 0) {
          await tx.insert(clientsTable).values(clientsToInsert);
        }
      });
    } catch (txError: unknown) {
      log.error('QuickBooks import transaction failed, rolling back:', txError);
      return res.status(500).json({
        error: 'Import transaction failed - no records were imported',
        code: 'TRANSACTION_FAILED',
        message: (txError instanceof Error ? txError.message : String(txError)),
        attemptedEmployees: employeesToInsert.length,
        attemptedClients: clientsToInsert.length,
      });
    }

    if (importedEmployees > 0) {
      broadcastToWorkspace(workspaceId, {
        type: 'employees_updated',
        action: 'imported',
        count: importedEmployees,
        source: 'quickbooks',
      });
    }
    if (importedClients > 0) {
      broadcastToWorkspace(workspaceId, {
        type: 'clients_updated',
        action: 'imported',
        count: importedClients,
        source: 'quickbooks',
      });
    }
    if (importedEmployees > 0 || importedClients > 0) {
      broadcastToWorkspace(workspaceId, {
        type: 'data_migrated',
        source: 'quickbooks',
        importedEmployees,
        importedClients,
      });
    }

    return res.json({
      success: true,
      importedEmployees,
      skippedEmployees,
      importedClients,
      skippedClients,
      totalEmployees: importedEmployees + skippedEmployees,
      totalClients: importedClients + skippedClients,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    log.error('QuickBooks import error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to import QuickBooks data' });
  }
});

/**
 * POST /api/integrations/quickbooks/preflight
 * 
 * Run pre-flight tests to verify QuickBooks integration works correctly
 */
router.post('/quickbooks/preflight', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Find connection
    const [connection] = await db.select()
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
      return res.status(404).json({ error: 'QuickBooks not connected' });
    }

    const tests: Array<{ name: string; status: 'passed' | 'failed'; error?: string }> = [];

    // Test 1: Verify access token is valid
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      if (accessToken) {
        tests.push({ name: 'Access Token Valid', status: 'passed' });
      } else {
        tests.push({ name: 'Access Token Valid', status: 'failed', error: 'No access token' });
      }
    } catch (err: unknown) {
      tests.push({ name: 'Access Token Valid', status: 'failed', error: (err instanceof Error ? err.message : String(err)) });
    }

    // Test 2: Can fetch company info
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const apiBase = getQuickBooksApiBase();
      
      const companyResponse = await fetch(`${apiBase}/${realmId}/companyinfo/${realmId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (companyResponse.ok) {
        tests.push({ name: 'Fetch Company Info', status: 'passed' });
      } else {
        tests.push({ name: 'Fetch Company Info', status: 'failed', error: `HTTP ${companyResponse.status}` });
      }
    } catch (err: unknown) {
      tests.push({ name: 'Fetch Company Info', status: 'failed', error: (err instanceof Error ? err.message : String(err)) });
    }

    // Test 3: Can query customers
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const apiBase = getQuickBooksApiBase();
      
      const query = encodeURIComponent('select count(*) from Customer');
      const custResponse = await fetch(`${apiBase}/${realmId}/query?query=${query}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (custResponse.ok) {
        tests.push({ name: 'Query Customers', status: 'passed' });
      } else {
        tests.push({ name: 'Query Customers', status: 'failed', error: `HTTP ${custResponse.status}` });
      }
    } catch (err: unknown) {
      tests.push({ name: 'Query Customers', status: 'failed', error: (err instanceof Error ? err.message : String(err)) });
    }

    // Test 4: Can query invoices
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const apiBase = getQuickBooksApiBase();
      
      const query = encodeURIComponent('select count(*) from Invoice');
      const invResponse = await fetch(`${apiBase}/${realmId}/query?query=${query}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (invResponse.ok) {
        tests.push({ name: 'Query Invoices', status: 'passed' });
      } else {
        tests.push({ name: 'Query Invoices', status: 'failed', error: `HTTP ${invResponse.status}` });
      }
    } catch (err: unknown) {
      tests.push({ name: 'Query Invoices', status: 'failed', error: (err instanceof Error ? err.message : String(err)) });
    }

    const allPassed = tests.every(t => t.status === 'passed');
    
    return res.json({
      success: true,
      allPassed,
      tests,
      connectionId: connection.id,
    });
  } catch (error: unknown) {
    log.error('QuickBooks preflight error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to run pre-flight tests' });
  }
});

// ============================================================================
// GUSTO INTEGRATION
// ============================================================================

/**
 * POST /api/integrations/gusto/connect
 * 
 * Initiate Gusto OAuth connection
 */
router.post('/gusto/connect', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Generate authorization URL
    const { url, state } = await gustoOAuthService.generateAuthorizationUrl(workspaceId);

    // Return URL for frontend to redirect user
    return res.json({ authorizationUrl: url });
  } catch (error: unknown) {
    log.error('Gusto connect error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to initiate Gusto connection' });
  }
});

/**
 * GET /api/integrations/gusto/callback
 * 
 * OAuth callback from Gusto after user grants access
 */
router.get('/gusto/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth errors (user denied, etc.)
    if (error) {
      return res.redirect(`/settings/integrations?error=${encodeURIComponent(error as string)}`);
    }

    if (!code || !state) {
      return res.redirect('/settings/integrations?error=missing_parameters');
    }

    // Exchange code for tokens
    const { workspaceId, connection } = await gustoOAuthService.exchangeCodeForTokens(
      code as string,
      state as string
    );

    // Redirect to integrations page with success message
    return res.redirect('/settings/integrations?success=gusto_connected');
  } catch (error: unknown) {
    log.error('Gusto callback error:', error);
    return res.redirect(`/settings/integrations?error=${encodeURIComponent(sanitizeError(error))}`);
  }
});

/**
 * POST /api/integrations/gusto/disconnect
 * 
 * Disconnect Gusto integration
 */
router.post('/gusto/disconnect', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Find connection
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'gusto')
        )
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({ error: 'Gusto connection not found' });
    }

    // Disconnect
    await gustoOAuthService.disconnect(connection.id);

    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('Gusto disconnect error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to disconnect Gusto' });
  }
});

/**
 * POST /api/integrations/gusto/refresh
 * 
 * Manually refresh Gusto access token
 */
router.post('/gusto/refresh', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Find connection
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'gusto')
        )
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({ error: 'Gusto connection not found' });
    }

    // Refresh token
    await gustoOAuthService.refreshAccessToken(connection.id);

    return res.json({ success: true });
  } catch (error: unknown) {
    log.error('Gusto refresh error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to refresh Gusto token' });
  }
});

// ============================================================================
// UNIFIED QUICKBOOKS STATUS (Single Source of Truth)
// ============================================================================

/**
 * GET /api/integrations/quickbooks/status
 * 
 * Unified endpoint returning all QuickBooks connection state, token status,
 * and OAuth URL when disconnected. This is the single source of truth for
 * all QuickBooks UI surfaces.
 */
router.get('/quickbooks/status', requireAuth, requireWorkspaceMembership('query'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const workspaceId = req.workspaceId || req.user?.workspaceId || (req.query.workspaceId as string);

    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Missing workspaceId',
        connected: false,
        authorizationUrl: null,
      });
    }

    // SECURITY: Get and validate request domain using canonical host
    const rawHost = req.get('host') || req.get('x-forwarded-host') || '';
    const canonicalHost = INTEGRATIONS.quickbooks.getCanonicalHost(rawHost);
    const isHostTrusted = INTEGRATIONS.quickbooks.validateRequestHost(rawHost) !== null;
    const qbEnvironment = INTEGRATIONS.quickbooks.getEnvironmentForDomain(canonicalHost);

    // Find QuickBooks connection
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        )
      )
      .limit(1);

    // Not connected - return OAuth URL with canonical domain context
    if (!connection) {
      const { url } = await quickbooksOAuthService.generateAuthorizationUrl(workspaceId, canonicalHost);
      return res.json({
        connected: false,
        status: 'disconnected',
        authorizationUrl: url,
        canConnect: true,
        message: 'QuickBooks not connected. Click to connect.',
        environment: qbEnvironment,
        requestDomain: canonicalHost,
        isHostTrusted,
      });
    }

    // Calculate token expiry status
    const now = new Date();
    const accessTokenExpiry = connection.expiresAt ? new Date(connection.expiresAt) : null;
    const refreshTokenExpiry = connection.refreshTokenExpiresAt ? new Date(connection.refreshTokenExpiresAt) : null;
    
    const accessTokenExpiresSoon = accessTokenExpiry && 
      (accessTokenExpiry.getTime() - now.getTime()) < 10 * 60 * 1000; // 10 minutes
    const refreshTokenExpiresSoon = refreshTokenExpiry && 
      (refreshTokenExpiry.getTime() - now.getTime()) < 7 * 24 * 60 * 60 * 1000; // 7 days
    const tokenExpired = accessTokenExpiry && accessTokenExpiry < now;
    const refreshTokenExpired = refreshTokenExpiry && refreshTokenExpiry < now;

    // Determine overall status
    let status: 'connected' | 'token_expiring' | 'token_expired' | 'disconnected_recoverable' | 'needs_reauthorization' | 'disconnected' | 'error' = 'connected';
    let needsAttention = false;
    let canRefresh = true;
    let message = 'QuickBooks connected and syncing';

    // Check if connection is disconnected or error state
    const isDisconnected = connection.status === 'disconnected';
    const isError = connection.status === 'error';
    const isExpired = connection.status === 'expired';
    const hasValidRefreshToken = !refreshTokenExpired && connection.refreshToken;

    // First, handle connection.status states that override token analysis
    if (isError) {
      status = 'error';
      needsAttention = true;
      canRefresh = hasValidRefreshToken;
      message = hasValidRefreshToken 
        ? 'Connection error. Click "Renew Connection" to try restoring access.'
        : 'Connection error. Please reconnect to QuickBooks.';
    } else if (isExpired || refreshTokenExpired) {
      // connection.status = 'expired' means refresh failed - needs full reauth
      status = 'needs_reauthorization';
      needsAttention = true;
      canRefresh = false;
      message = 'Both tokens have expired. You need to reconnect to QuickBooks.';
    } else if (isDisconnected && hasValidRefreshToken) {
      status = 'disconnected_recoverable';
      needsAttention = true;
      canRefresh = true;
      message = 'QuickBooks was disconnected. Click "Renew Connection" to restore access.';
    } else if (isDisconnected) {
      status = 'disconnected';
      needsAttention = true;
      canRefresh = false;
      message = 'QuickBooks is disconnected. Please reconnect.';
    } else if (tokenExpired && hasValidRefreshToken) {
      status = 'token_expired';
      needsAttention = true;
      canRefresh = true;
      message = 'Access token expired. Click "Renew Connection" to restore access.';
      // Trigger background refresh
      quickbooksTokenRefresh.refreshExpiringTokens().catch((err: unknown) => log.error('[QB] Background token refresh failed:', err));
    } else if (tokenExpired) {
      status = 'token_expired';
      needsAttention = true;
      canRefresh = false;
      message = 'Access token expired. Please reconnect to QuickBooks.';
    } else if (connection.status !== 'connected') {
      // Handle any other non-connected states
      status = 'disconnected';
      needsAttention = true;
      canRefresh = hasValidRefreshToken;
      message = hasValidRefreshToken 
        ? 'QuickBooks needs attention. Click "Renew Connection" to restore access.'
        : 'QuickBooks is not connected. Please reconnect.';
    } else if (accessTokenExpiresSoon) {
      status = 'token_expiring';
      needsAttention = false; // Not critical, will auto-refresh
      message = 'Token expiring soon. Will auto-refresh when needed.';
      // Trigger background refresh
      quickbooksTokenRefresh.refreshExpiringTokens().catch((err: unknown) => log.error('[QB] Background token refresh failed:', err));
    } else if (refreshTokenExpiresSoon) {
      status = 'token_expiring';
      needsAttention = true;
      message = 'Refresh token expiring in less than 7 days.';
    }

    // Get company info from metadata
    const metadata = connection.metadata as any || {};
    const companyName = metadata.companyName || metadata.CompanyName || 'Unknown Company';

    return res.json({
      connected: connection.status === 'connected' && !tokenExpired,
      status,
      connectionId: connection.id,
      realmId: connection.realmId,
      companyId: connection.companyId,
      companyName,
      lastSyncedAt: connection.lastSyncAt,
      accessTokenExpiresAt: connection.expiresAt,
      refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
      tokenExpiresSoon: accessTokenExpiresSoon || refreshTokenExpiresSoon,
      tokenExpired: !!tokenExpired,
      needsAttention,
      message,
      canDisconnect: true,
      canRefresh,
      migrationWizardAvailable: true,
      // Environment diagnostics
      environment: qbEnvironment,
      requestDomain: canonicalHost,
      isHostTrusted,
    });
  } catch (error: unknown) {
    log.error('QuickBooks status error:', error);
    return res.status(500).json({ 
      error: sanitizeError(error),
      connected: false,
      status: 'error',
    });
  }
});

/**
 * POST /api/integrations/quickbooks/reset-migration
 * 
 * Reset migration wizard state - allows user to restart migration
 * Clears in-memory flows, database records, and data mappings
 */
router.post('/quickbooks/reset-migration', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    log.info(`[QuickBooks] Migration reset requested for workspace ${workspaceId} by user ${userId}`);

    // Use the orchestration service to properly reset all flow state
    const result = await onboardingQuickBooksFlow.resetFlow(workspaceId);

    if (!result.success) {
      return res.status(500).json({ 
        error: result.message,
        success: false,
      });
    }

    return res.json({ 
      success: true,
      message: result.message,
      clearedFlows: result.clearedFlows,
    });
  } catch (error: unknown) {
    log.error('QuickBooks reset-migration error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// CONNECTION STATUS
// ============================================================================

/**
 * GET /api/integrations/connections
 * 
 * Get all partner connections for workspace
 */
router.get('/connections', requireAuth, requireWorkspaceMembership('query'), async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Fetch all connections for workspace - use simpler query to avoid metadata field issues
    const rawConnections = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.workspaceId, workspaceId));

    // Map to safe response format - don't expose actual tokens
    const connections = rawConnections.map(conn => ({
      id: conn.id,
      partnerType: conn.partnerType,
      status: conn.status,
      companyId: conn.companyId,
      companyName: (conn.metadata as any)?.companyName || null,
      lastSyncedAt: conn.lastSyncedAt,
      accessTokenExpiresAt: conn.accessTokenExpiresAt,
      refreshTokenExpiresAt: conn.refreshTokenExpiresAt,
    }));

    return res.json({ connections });
  } catch (error: unknown) {
    log.error('Fetch connections error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch connections' });
  }
});

// ============================================================================
// PARTNER OPERATIONS - QUICKBOOKS
// ============================================================================

/**
 * POST /api/integrations/quickbooks/sync-client
 * 
 * Sync CoAIleague client to QuickBooks customer
 */
router.post('/quickbooks/sync-client', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, clientId } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !clientId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const customerId = await quickbooksService.syncClient(workspaceId, clientId, userId);

    return res.json({ 
      success: true, 
      customerId,
      message: 'Client synced to QuickBooks successfully'
    });
  } catch (error: unknown) {
    log.error('Sync client error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to sync client' });
  }
});

/**
 * POST /api/integrations/quickbooks/create-invoice
 * 
 * Create invoice in QuickBooks from CoAIleague invoice
 */
router.post('/quickbooks/create-invoice', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, invoiceId } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !invoiceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qboInvoiceId = await quickbooksService.createInvoice(workspaceId, invoiceId, userId);

    return res.json({ 
      success: true, 
      qboInvoiceId,
      message: 'Invoice created in QuickBooks successfully'
    });
  } catch (error: unknown) {
    log.error('Create invoice error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to create invoice' });
  }
});

/**
 * POST /api/integrations/quickbooks/record-payment
 * 
 * Record payment in QuickBooks
 */
router.post('/quickbooks/record-payment', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, invoiceId, amount } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !invoiceId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const paymentId = await quickbooksService.recordPayment(workspaceId, invoiceId, amount, userId);

    return res.json({ 
      success: true, 
      paymentId,
      message: 'Payment recorded in QuickBooks successfully'
    });
  } catch (error: unknown) {
    log.error('Record payment error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to record payment' });
  }
});

// ============================================================================
// PARTNER OPERATIONS - GUSTO
// ============================================================================

/**
 * POST /api/integrations/gusto/sync-employee
 * 
 * Sync CoAIleague employee to Gusto
 */
router.post('/gusto/sync-employee', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, employeeId } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !employeeId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const gustoEmployeeId = await gustoService.syncEmployee(workspaceId, employeeId, userId);

    return res.json({ 
      success: true, 
      gustoEmployeeId,
      message: 'Employee synced to Gusto successfully'
    });
  } catch (error: unknown) {
    log.error('Sync employee error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to sync employee' });
  }
});

/**
 * POST /api/integrations/gusto/create-payroll
 * 
 * Create payroll run in Gusto
 */
router.post('/gusto/create-payroll', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, payrollRunId } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !payrollRunId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const gustoPayrollId = await gustoService.createPayrollRun(workspaceId, payrollRunId, userId);

    return res.json({ 
      success: true, 
      gustoPayrollId,
      message: 'Payroll run created in Gusto successfully'
    });
  } catch (error: unknown) {
    log.error('Create payroll error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to create payroll' });
  }
});

/**
 * POST /api/integrations/gusto/submit-time
 * 
 * Submit time activities to Gusto for payroll
 */
router.post('/gusto/submit-time', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, payrollRunId } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !payrollRunId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await gustoService.submitTimeActivities(workspaceId, payrollRunId, userId);

    return res.json({ 
      success: true,
      message: 'Time activities submitted to Gusto successfully'
    });
  } catch (error: unknown) {
    log.error('Submit time error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to submit time activities' });
  }
});

/**
 * POST /api/integrations/gusto/process-payroll
 * 
 * Process payroll run in Gusto (finalize and submit)
 */
router.post('/gusto/process-payroll', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, payrollRunId } = req.body;
    const userId = req.user?.id || req.session?.userId;

    if (!workspaceId || !payrollRunId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const run = await storage.getPayrollRun(payrollRunId, workspaceId);
    if (!run) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }
    if (run.status !== 'approved' && run.status !== 'processed') {
      return res.status(400).json({ error: `Payroll run must be approved before Gusto submission (current status: ${run.status})` });
    }

    await gustoService.processPayroll(workspaceId, payrollRunId, userId);

    return res.json({ 
      success: true,
      message: 'Payroll processed in Gusto successfully'
    });
  } catch (error: unknown) {
    log.error('Process payroll error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to process payroll' });
  }
});

// ============================================================================
// QUICKBOOKS COMPLIANCE TELEMETRY (Guru Mode Dashboard)
// ============================================================================

/**
 * GET /api/integrations/quickbooks/compliance-telemetry
 * 
 * Returns QuickBooks compliance metrics for Trinity Guru Mode:
 * - Rate limit status (bucket fill gauge)
 * - Token refresh daemon health
 * - API usage history
 * - Quota warnings
 */
// SECURITY: Platform-diagnostic endpoint — restrict to platform staff only
router.get('/quickbooks/compliance-telemetry', requireAuth, requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const realmId = req.query.realmId as string | undefined;
    const environment = (req.query.environment as 'production' | 'sandbox') || 'production';
    
    // Get rate limit stats for specific realm or all realms (with null safety)
    let rateLimitStats: any[] = [];
    try {
      if (realmId) {
        const stats = quickbooksRateLimiter.getStats(realmId, environment);
        if (stats) rateLimitStats = [stats];
      } else {
        rateLimitStats = quickbooksRateLimiter.getAllStats(environment) || [];
      }
    } catch (e) {
      log.warn('[QB Telemetry] Could not fetch rate limit stats:', e);
    }
    
    // Get token refresh daemon status
    const tokenDaemonStatus = quickbooksTokenRefresh.getStatus();
    
    // Get recent API usage from database
    let recentUsage: any[] = [];
    try {
      // Converted to Drizzle ORM: getRecentUsage → INTERVAL
      const usageResult = await db.execute(
        sql`SELECT 
          realm_id as "realmId",
          request_count as "requestCount",
          last_request_at as "lastRequestAt",
          quota_warnings_sent as "quotaWarningsSent"
        FROM quickbooks_api_usage
        WHERE last_request_at > NOW() - INTERVAL '1 hour'
        ORDER BY last_request_at DESC
        LIMIT 20`
      );
      recentUsage = (usageResult.rows || []) as any[];
    } catch (e) {
      // Table may not exist in fresh deployments
      log.warn('[QB Telemetry] Could not fetch API usage:', e);
    }
    
    // Get active credentials count and health
    let credentialsHealth: any[] = [];
    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: oauth_states | Verified: 2026-03-23
      const credsResult = await typedQuery(
        sql`SELECT 
          id,
          partner_type as "partnerType",
          workspace_id as "workspaceId",
          expires_at as "expiresAt",
          created_at as "createdAt"
        FROM oauth_states
        WHERE partner_type = 'quickbooks'
        ORDER BY created_at DESC`
      );
      credentialsHealth = (credsResult.rows || []).map((row: any) => ({
        realmId: row.workspaceId,
        isHealthy: !row.expiresAt || new Date(row.expiresAt) > new Date(),
        expiresAt: row.expiresAt,
        failedAttempts: 0,
        lastRefreshed: row.createdAt,
      }));
    } catch (e) {
      log.warn('[QB Telemetry] Could not fetch credentials health:', e);
    }
    
    // Calculate overall health score
    const maxRequestsPerMinute = environment === 'production' ? 500 : 100;
    const healthScore = rateLimitStats.reduce((acc, stat) => {
      const usagePercent = ((maxRequestsPerMinute - stat.tokensRemaining) / maxRequestsPerMinute) * 100;
      return acc + (stat.isThrottled ? 0 : 100 - usagePercent);
    }, 0) / Math.max(rateLimitStats.length, 1);
    
    return res.json({
      success: true,
      telemetry: {
        rateLimits: rateLimitStats.map(stat => ({
          realmId: stat.realmId,
          tokensRemaining: stat.tokensRemaining,
          maxTokens: maxRequestsPerMinute,
          usagePercent: ((maxRequestsPerMinute - stat.tokensRemaining) / maxRequestsPerMinute) * 100,
          concurrentRequests: stat.concurrentRequests,
          isThrottled: stat.isThrottled,
          requestsLastMinute: stat.requestsLastMinute,
        })),
        tokenDaemon: {
          isRunning: tokenDaemonStatus.isRunning,
          cachedCredentials: tokenDaemonStatus.cachedCredentials,
          health: tokenDaemonStatus.isRunning ? 'healthy' : 'stopped',
        },
        credentialsHealth,
        recentUsage,
        summary: {
          activeRealms: rateLimitStats.length,
          healthScore: Math.round(healthScore),
          throttledRealms: rateLimitStats.filter(s => s.isThrottled).length,
          totalRequestsLastHour: recentUsage.reduce((acc, u) => acc + (u.requestCount || 0), 0),
        },
      },
    });
  } catch (error: unknown) {
    log.error('QuickBooks telemetry error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch compliance telemetry' });
  }
});

/**
 * GET /api/integrations/quickbooks/usage-logs/:realmId
 * 
 * Returns detailed API usage logs for a specific realm (Support Override Menu)
 */
// SECURITY: Platform-diagnostic endpoint — restrict to platform staff only
router.get('/quickbooks/usage-logs/:realmId', requireAuth, requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { realmId } = req.params;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    
    if (!realmId) {
      return res.status(400).json({ error: 'Realm ID required' });
    }
    
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: quickbooks_api_usage | Verified: 2026-03-23
    const usageResult = await typedQuery(
      sql`SELECT 
        id,
        realm_id as "realmId",
        workspace_id as "workspaceId",
        request_count as "requestCount",
        period_start as "periodStart"
      FROM quickbooks_api_usage
      WHERE realm_id = ${realmId}
      ORDER BY period_start DESC
      LIMIT ${limit}`
    );
    
    return res.json({
      success: true,
      logs: usageResult.rows || [],
      realmId,
    });
  } catch (error: unknown) {
    log.error('QuickBooks usage logs error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch usage logs' });
  }
});

/**
 * GET /api/integrations/quickbooks/execution-history
 * 
 * Returns QuickBooks operation execution history with step-level breakdown.
 * Fortune 500-grade observability for all QB orchestrated operations.
 */
router.get('/quickbooks/execution-history', requireAuth, requireWorkspaceMembership('query'), async (req: Request, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const since = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days
    const operationType = req.query.operationType as string | undefined;

    const conditions = [
      eq(systemAuditLogs.workspaceId, workspaceId),
      like(systemAuditLogs.action, 'orchestration.%'),
      gte(systemAuditLogs.timestamp, since),
    ];

    const logs = await db.select({
      id: systemAuditLogs.id,
      action: systemAuditLogs.action,
      details: systemAuditLogs.details,
      severity: systemAuditLogs.severity,
      timestamp: systemAuditLogs.timestamp,
    })
      .from(systemAuditLogs)
      .where(and(...conditions))
      .orderBy(desc(systemAuditLogs.timestamp))
      .limit(limit);

    const qbLogs = logs.filter(log => {
      try {
        const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        const isQB = details?.domain === 'quickbooks' || 
                     details?.actionName?.toLowerCase().includes('quickbooks') ||
                     details?.externalSystem === 'quickbooks';
        if (operationType && isQB) {
          return details?.operationType === operationType;
        }
        return isQB;
      } catch {
        return false;
      }
    });

    const orchestrationMap = new Map<string, any>();

    for (const log of qbLogs) {
      try {
        const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        const orchestrationId = details?.orchestrationId;

        if (!orchestrationId) continue;

        if (!orchestrationMap.has(orchestrationId)) {
          orchestrationMap.set(orchestrationId, {
            orchestrationId,
            operationName: details?.actionName || details?.operationType || 'Unknown',
            operationType: details?.operationType,
            domain: details?.domain,
            triggeredBy: details?.triggeredBy,
            startedAt: log.timestamp,
            completedAt: null,
            status: 'in_progress',
            steps: [],
            errors: [],
            metadata: {},
          });
        }

        const entry = orchestrationMap.get(orchestrationId)!;

        if (log.action.includes('step')) {
          entry.steps.push({
            step: details?.step,
            status: details?.status,
            durationMs: details?.durationMs,
            timestamp: log.timestamp,
            error: details?.error,
            errorCode: details?.errorCode,
          });
        }

        if (log.action.includes('completed') || log.action.includes('finished')) {
          entry.completedAt = log.timestamp;
          entry.status = details?.status || 'completed';
          entry.durationMs = details?.durationMs;
          entry.recordsProcessed = details?.recordsProcessed;
        }

        if (log.action.includes('failed') || log.action.includes('error')) {
          entry.status = 'failed';
          entry.errors.push({
            error: details?.error,
            errorCode: details?.errorCode,
            remediation: details?.remediation,
            retryable: details?.retryable,
            timestamp: log.timestamp,
          });
        }

        if (details?.metadata) {
          Object.assign(entry.metadata, details.metadata);
        }
      } catch (e) {
        log.error('[QB ExecutionHistory] Parse error:', e);
      }
    }

    const executions = Array.from(orchestrationMap.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const summary = {
      total: executions.length,
      completed: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      inProgress: executions.filter(e => e.status === 'in_progress').length,
      byOperationType: {} as Record<string, number>,
    };

    for (const exec of executions) {
      if (exec.operationType) {
        summary.byOperationType[exec.operationType] = (summary.byOperationType[exec.operationType] || 0) + 1;
      }
    }

    return res.json({
      success: true,
      workspaceId,
      timeRange: {
        since: since.toISOString(),
        until: new Date().toISOString(),
      },
      summary,
      executions,
    });
  } catch (error: unknown) {
    log.error('[QB ExecutionHistory] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: sanitizeError(error) || 'Failed to fetch execution history' 
    });
  }
});

// Start scheduled OAuth state cleanup job
quickbooksOAuthService.startScheduledCleanup();

export default router;
