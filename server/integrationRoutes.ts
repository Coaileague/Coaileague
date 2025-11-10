import { Router, Request, Response, RequestHandler } from 'express';
import { quickbooksOAuthService } from './services/oauth/quickbooks';
import { gustoOAuthService } from './services/oauth/gusto';
import { quickbooksService } from './services/partners/quickbooks';
import { gustoService } from './services/partners/gusto';
import { requireAuth } from './auth';
import { db } from './db';
import { partnerConnections, users, workspaces } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

const router = Router();

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
    } catch (error: any) {
      console.error('Workspace membership check error:', error);
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

    // Generate authorization URL
    const { url, state } = await quickbooksOAuthService.generateAuthorizationUrl(workspaceId);

    // Return URL for frontend to redirect user
    return res.json({ authorizationUrl: url });
  } catch (error: any) {
    console.error('QuickBooks connect error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate QuickBooks connection' });
  }
});

/**
 * GET /api/integrations/quickbooks/callback
 * 
 * OAuth callback from QuickBooks after user grants access
 */
router.get('/quickbooks/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, realmId, error } = req.query;

    // Handle OAuth errors (user denied, etc.)
    if (error) {
      return res.redirect(`/settings/integrations?error=${encodeURIComponent(error as string)}`);
    }

    if (!code || !state || !realmId) {
      return res.redirect('/settings/integrations?error=missing_parameters');
    }

    // Exchange code for tokens
    const { workspaceId, connection } = await quickbooksOAuthService.exchangeCodeForTokens(
      code as string,
      state as string,
      realmId as string
    );

    // Redirect to integrations page with success message
    return res.redirect('/settings/integrations?success=quickbooks_connected');
  } catch (error: any) {
    console.error('QuickBooks callback error:', error);
    return res.redirect(`/settings/integrations?error=${encodeURIComponent(error.message)}`);
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
  } catch (error: any) {
    console.error('QuickBooks disconnect error:', error);
    return res.status(500).json({ error: error.message || 'Failed to disconnect QuickBooks' });
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
  } catch (error: any) {
    console.error('QuickBooks refresh error:', error);
    return res.status(500).json({ error: error.message || 'Failed to refresh QuickBooks token' });
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
  } catch (error: any) {
    console.error('Gusto connect error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate Gusto connection' });
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
  } catch (error: any) {
    console.error('Gusto callback error:', error);
    return res.redirect(`/settings/integrations?error=${encodeURIComponent(error.message)}`);
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
  } catch (error: any) {
    console.error('Gusto disconnect error:', error);
    return res.status(500).json({ error: error.message || 'Failed to disconnect Gusto' });
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
  } catch (error: any) {
    console.error('Gusto refresh error:', error);
    return res.status(500).json({ error: error.message || 'Failed to refresh Gusto token' });
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

    // Fetch all connections for workspace
    const connections = await db.select({
      id: partnerConnections.id,
      partnerType: partnerConnections.partnerType,
      status: partnerConnections.status,
      companyId: partnerConnections.companyId,
      lastSyncedAt: partnerConnections.lastSyncedAt,
      accessTokenExpiresAt: partnerConnections.accessTokenExpiresAt,
      refreshTokenExpiresAt: partnerConnections.refreshTokenExpiresAt,
      metadata: partnerConnections.metadata,
    })
      .from(partnerConnections)
      .where(eq(partnerConnections.workspaceId, workspaceId));

    // Don't expose actual tokens
    return res.json({ connections });
  } catch (error: any) {
    console.error('Fetch connections error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch connections' });
  }
});

// ============================================================================
// PARTNER OPERATIONS - QUICKBOOKS
// ============================================================================

/**
 * POST /api/integrations/quickbooks/sync-client
 * 
 * Sync AutoForce client to QuickBooks customer
 */
router.post('/quickbooks/sync-client', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, clientId } = req.body;
    const userId = (req as any).session?.userId;

    if (!workspaceId || !clientId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const customerId = await quickbooksService.syncClient(workspaceId, clientId, userId);

    return res.json({ 
      success: true, 
      customerId,
      message: 'Client synced to QuickBooks successfully'
    });
  } catch (error: any) {
    console.error('Sync client error:', error);
    return res.status(500).json({ error: error.message || 'Failed to sync client' });
  }
});

/**
 * POST /api/integrations/quickbooks/create-invoice
 * 
 * Create invoice in QuickBooks from AutoForce invoice
 */
router.post('/quickbooks/create-invoice', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, invoiceId } = req.body;
    const userId = (req as any).session?.userId;

    if (!workspaceId || !invoiceId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const qboInvoiceId = await quickbooksService.createInvoice(workspaceId, invoiceId, userId);

    return res.json({ 
      success: true, 
      qboInvoiceId,
      message: 'Invoice created in QuickBooks successfully'
    });
  } catch (error: any) {
    console.error('Create invoice error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create invoice' });
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
    const userId = (req as any).session?.userId;

    if (!workspaceId || !invoiceId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const paymentId = await quickbooksService.recordPayment(workspaceId, invoiceId, amount, userId);

    return res.json({ 
      success: true, 
      paymentId,
      message: 'Payment recorded in QuickBooks successfully'
    });
  } catch (error: any) {
    console.error('Record payment error:', error);
    return res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
});

// ============================================================================
// PARTNER OPERATIONS - GUSTO
// ============================================================================

/**
 * POST /api/integrations/gusto/sync-employee
 * 
 * Sync AutoForce employee to Gusto
 */
router.post('/gusto/sync-employee', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, employeeId } = req.body;
    const userId = (req as any).session?.userId;

    if (!workspaceId || !employeeId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const gustoEmployeeId = await gustoService.syncEmployee(workspaceId, employeeId, userId);

    return res.json({ 
      success: true, 
      gustoEmployeeId,
      message: 'Employee synced to Gusto successfully'
    });
  } catch (error: any) {
    console.error('Sync employee error:', error);
    return res.status(500).json({ error: error.message || 'Failed to sync employee' });
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
    const userId = (req as any).session?.userId;

    if (!workspaceId || !payrollRunId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const gustoPayrollId = await gustoService.createPayrollRun(workspaceId, payrollRunId, userId);

    return res.json({ 
      success: true, 
      gustoPayrollId,
      message: 'Payroll run created in Gusto successfully'
    });
  } catch (error: any) {
    console.error('Create payroll error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create payroll' });
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
    const userId = (req as any).session?.userId;

    if (!workspaceId || !payrollRunId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await gustoService.submitTimeActivities(workspaceId, payrollRunId, userId);

    return res.json({ 
      success: true,
      message: 'Time activities submitted to Gusto successfully'
    });
  } catch (error: any) {
    console.error('Submit time error:', error);
    return res.status(500).json({ error: error.message || 'Failed to submit time activities' });
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
    const userId = (req as any).session?.userId;

    if (!workspaceId || !payrollRunId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await gustoService.processPayroll(workspaceId, payrollRunId, userId);

    return res.json({ 
      success: true,
      message: 'Payroll processed in Gusto successfully'
    });
  } catch (error: any) {
    console.error('Process payroll error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process payroll' });
  }
});

export default router;
