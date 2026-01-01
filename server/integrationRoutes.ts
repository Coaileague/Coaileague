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
      return res.status(404).json({ error: 'QuickBooks not connected' });
    }

    // Get valid access token
    const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
    const realmId = connection.realmId!;
    const apiBase = 'https://quickbooks.api.intuit.com/v3/company';

    // Fetch employees (all, not just active, for complete view)
    const employeeQuery = encodeURIComponent('select * from Employee MAXRESULTS 100');
    const employeeResponse = await fetch(`${apiBase}/${realmId}/query?query=${employeeQuery}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    let employees: any[] = [];
    if (employeeResponse.ok) {
      const empData = await employeeResponse.json();
      employees = (empData.QueryResponse?.Employee || []).map((e: any) => ({
        qboId: e.Id,
        displayName: e.DisplayName,
        givenName: e.GivenName || '',
        familyName: e.FamilyName || '',
        email: e.PrimaryEmailAddr?.Address || '',
        phone: e.PrimaryPhone?.FreeFormNumber || '',
        active: e.Active !== false,
        payRate: e.BillRate || e.CostRate || null,
        employeeType: e.V4IDPseudonym ? '1099' : 'W2',
        role: e.JobTitle || 'Field Staff',
      }));
    }

    // Fetch customers (all, not just active)
    const customerQuery = encodeURIComponent('select * from Customer MAXRESULTS 100');
    const customerResponse = await fetch(`${apiBase}/${realmId}/query?query=${customerQuery}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    let customers: any[] = [];
    if (customerResponse.ok) {
      const custData = await customerResponse.json();
      customers = (custData.QueryResponse?.Customer || []).map((c: any) => ({
        qboId: c.Id,
        displayName: c.DisplayName,
        companyName: c.CompanyName || c.DisplayName,
        email: c.PrimaryEmailAddr?.Address || '',
        phone: c.PrimaryPhone?.FreeFormNumber || '',
        active: c.Active !== false,
        balance: c.Balance || 0,
      }));
    }

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
      console.log('Payroll items not available (may require payroll subscription)');
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
      console.log('Chart of accounts fetch error');
    }

    return res.json({
      employees,
      customers,
      payrollItems,
      chartOfAccounts,
      connectionId: connection.id,
      companyName: connection.companyName || 'QuickBooks Company',
    });
  } catch (error: any) {
    console.error('QuickBooks preview error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch QuickBooks data' });
  }
});

/**
 * POST /api/integrations/quickbooks/import
 * 
 * Import selected employees and customers from QuickBooks with duplicate detection
 */
router.post('/quickbooks/import', requireAuth, requireWorkspaceMembership(), async (req: Request, res: Response) => {
  try {
    const { workspaceId, selectedEmployees, selectedCustomers } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Missing workspaceId' });
    }

    // Validate arrays
    if (selectedEmployees && !Array.isArray(selectedEmployees)) {
      return res.status(400).json({ error: 'selectedEmployees must be an array' });
    }
    if (selectedCustomers && !Array.isArray(selectedCustomers)) {
      return res.status(400).json({ error: 'selectedCustomers must be an array' });
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

    let importedEmployees = 0;
    let skippedEmployees = 0;
    let importedClients = 0;
    let skippedClients = 0;
    const errors: string[] = [];

    const { employees: employeesTable, clients: clientsTable } = await import('@shared/schema');

    // Import employees with robust duplicate detection
    if (selectedEmployees && selectedEmployees.length > 0) {
      // Get workspace for employee ID generation
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const orgCode = ws?.orgCode || 'ORG';
      const prefix = orgCode.replace('ORG-', '');

      // Pre-fetch existing employees for duplicate checking
      const existingEmployees = await db.select()
        .from(employeesTable)
        .where(eq(employeesTable.workspaceId, workspaceId));
      
      const existingByQboId = new Map(
        existingEmployees
          .filter(e => e.partnerEmployeeId && e.partnerType === 'quickbooks')
          .map(e => [e.partnerEmployeeId, e])
      );
      const existingByEmail = new Map(
        existingEmployees
          .filter(e => e.email)
          .map(e => [e.email!.toLowerCase(), e])
      );
      
      let empCounter = existingEmployees.length;

      for (const emp of selectedEmployees) {
        try {
          // Validate required fields
          const qboId = String(emp.qboId || '').trim();
          const displayName = String(emp.displayName || '').trim();
          
          if (!qboId || !displayName) {
            errors.push(`Invalid employee data: missing qboId or displayName`);
            continue;
          }

          // Check for duplicates by QuickBooks ID first (most reliable)
          if (existingByQboId.has(qboId)) {
            skippedEmployees++;
            continue;
          }

          // Check for duplicates by email
          const email = String(emp.email || '').trim().toLowerCase();
          if (email && existingByEmail.has(email)) {
            skippedEmployees++;
            continue;
          }

          // Generate employee ID
          empCounter++;
          const empNum = String(empCounter).padStart(5, '0');

          // Sanitize and insert
          const firstName = String(emp.givenName || displayName.split(' ')[0] || 'Unknown').trim().slice(0, 100);
          const lastName = String(emp.familyName || displayName.split(' ').slice(1).join(' ') || '').trim().slice(0, 100);
          const phone = String(emp.phone || '').trim().slice(0, 20) || null;

          // Get pay rate from employee data if available
          const payRate = emp.payRate ? parseFloat(String(emp.payRate)) : null;
          
          await db.insert(employeesTable).values({
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
          
          // Update our maps to prevent same-batch duplicates
          existingByQboId.set(qboId, {} as any);
          if (email) existingByEmail.set(email, {} as any);
          
          importedEmployees++;
        } catch (err: any) {
          errors.push(`Employee ${emp.displayName}: ${err.message}`);
        }
      }
    }

    // Import clients/customers with robust duplicate detection
    if (selectedCustomers && selectedCustomers.length > 0) {
      // Pre-fetch existing clients for duplicate checking
      const existingClients = await db.select()
        .from(clientsTable)
        .where(eq(clientsTable.workspaceId, workspaceId));
      
      const existingByQboId = new Map(
        existingClients
          .filter(c => c.partnerCustomerId && c.partnerType === 'quickbooks')
          .map(c => [c.partnerCustomerId, c])
      );
      const existingByName = new Map(
        existingClients.map(c => [c.name.toLowerCase(), c])
      );

      for (const cust of selectedCustomers) {
        try {
          // Validate required fields
          const qboId = String(cust.qboId || '').trim();
          const companyName = String(cust.companyName || cust.displayName || '').trim();
          
          if (!qboId || !companyName) {
            errors.push(`Invalid client data: missing qboId or name`);
            continue;
          }

          // Check for duplicates by QuickBooks ID first
          if (existingByQboId.has(qboId)) {
            skippedClients++;
            continue;
          }

          // Check for duplicates by name
          if (existingByName.has(companyName.toLowerCase())) {
            skippedClients++;
            continue;
          }

          // Sanitize and insert
          const email = String(cust.email || '').trim().slice(0, 255) || null;
          const phone = String(cust.phone || '').trim().slice(0, 20) || null;

          await db.insert(clientsTable).values({
            workspaceId,
            name: companyName.slice(0, 255),
            email,
            phone,
            status: 'active',
            partnerCustomerId: qboId,
            partnerType: 'quickbooks',
            quickbooksClientId: qboId,
          });
          
          // Update maps to prevent same-batch duplicates
          existingByQboId.set(qboId, {} as any);
          existingByName.set(companyName.toLowerCase(), {} as any);
          
          importedClients++;
        } catch (err: any) {
          errors.push(`Client ${cust.displayName}: ${err.message}`);
        }
      }
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
  } catch (error: any) {
    console.error('QuickBooks import error:', error);
    return res.status(500).json({ error: error.message || 'Failed to import QuickBooks data' });
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
    } catch (err: any) {
      tests.push({ name: 'Access Token Valid', status: 'failed', error: err.message });
    }

    // Test 2: Can fetch company info
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const apiBase = 'https://quickbooks.api.intuit.com/v3/company';
      
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
    } catch (err: any) {
      tests.push({ name: 'Fetch Company Info', status: 'failed', error: err.message });
    }

    // Test 3: Can query customers
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const apiBase = 'https://quickbooks.api.intuit.com/v3/company';
      
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
    } catch (err: any) {
      tests.push({ name: 'Query Customers', status: 'failed', error: err.message });
    }

    // Test 4: Can query invoices
    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const apiBase = 'https://quickbooks.api.intuit.com/v3/company';
      
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
    } catch (err: any) {
      tests.push({ name: 'Query Invoices', status: 'failed', error: err.message });
    }

    const allPassed = tests.every(t => t.status === 'passed');
    
    return res.json({
      success: true,
      allPassed,
      tests,
      connectionId: connection.id,
    });
  } catch (error: any) {
    console.error('QuickBooks preflight error:', error);
    return res.status(500).json({ error: error.message || 'Failed to run pre-flight tests' });
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
 * Sync CoAIleague client to QuickBooks customer
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
 * Create invoice in QuickBooks from CoAIleague invoice
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
 * Sync CoAIleague employee to Gusto
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
