import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { orgFinanceSettings, payStubs, employeeBankAccounts, employees } from '@shared/schema';
import {
  isPlaidConfigured,
  createLinkToken,
  exchangePublicToken,
  getAccountDetails,
  plaidEncrypt,
} from '../services/partners/plaidService';
import { platformEventBus } from '../services/platformEventBus';
import { broadcastToWorkspace } from '../websocket';
import { createLogger } from '../lib/logger';
const log = createLogger('PlaidRoutes');


const router = Router();

function getWorkspaceId(req: any): string {
  return req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId || '';
}
function getUserId(req: any): string {
  return req.user?.id || '';
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const configured = isPlaidConfigured();
    const workspaceId = getWorkspaceId(req);
    let orgBankConnected = false;
    let orgBankLast4: string | null = null;
    let orgBankName: string | null = null;

    if (workspaceId) {
      const [settings] = await db
        .select({
          plaidItemId: orgFinanceSettings.plaidItemId,
          plaidAccountLast4: orgFinanceSettings.plaidAccountLast4,
          plaidInstitutionName: orgFinanceSettings.plaidInstitutionName,
        })
        .from(orgFinanceSettings)
        .where(eq(orgFinanceSettings.workspaceId, workspaceId))
        .limit(1);

      orgBankConnected = !!(settings?.plaidItemId);
      orgBankLast4 = settings?.plaidAccountLast4 || null;
      orgBankName = settings?.plaidInstitutionName || null;
    }

    res.json({
      configured,
      environment: process.env.PLAID_ENV || 'sandbox',
      orgBankConnected,
      orgBankLast4,
      orgBankName,
    });
  } catch (error: any) {
    log.error('[Plaid] Status error:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch Plaid status' });
  }
});

router.post('/link-token/org', requireAuth, async (req, res) => {
  try {
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on this server' });
    }
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);
    const result = await createLinkToken({ userId, workspaceId, purpose: 'org_funding' });
    res.json(result);
  } catch (err: unknown) {
    log.error('[PlaidRoutes] link-token/org error:', sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/exchange/org', requireAuth, async (req, res) => {
  try {
    const { publicToken } = req.body;
    if (!publicToken) return res.status(400).json({ error: 'publicToken required' });
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);

    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const details = await getAccountDetails(accessToken);
    const encrypted = plaidEncrypt(accessToken);

    const existing = await db
      .select({ id: orgFinanceSettings.id })
      .from(orgFinanceSettings)
      .where(eq(orgFinanceSettings.workspaceId, workspaceId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(orgFinanceSettings)
        .set({
          plaidAccessTokenEncrypted: encrypted,
          plaidItemId: itemId,
          plaidAccountId: details.accountId,
          plaidAccountLast4: details.mask,
          plaidAccountName: details.accountName,
          plaidInstitutionName: details.institutionName,
          plaidBankConnectedAt: new Date(),
          plaidBankConnectedBy: userId,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(orgFinanceSettings.workspaceId, workspaceId));
    } else {
      await db.insert(orgFinanceSettings).values({
        workspaceId,
        plaidAccessTokenEncrypted: encrypted,
        plaidItemId: itemId,
        plaidAccountId: details.accountId,
        plaidAccountLast4: details.mask,
        plaidAccountName: details.accountName,
        plaidInstitutionName: details.institutionName,
        plaidBankConnectedAt: new Date(),
        plaidBankConnectedBy: userId,
        updatedBy: userId,
      });
    }

    broadcastToWorkspace(workspaceId, {
      type: 'org_bank_connected',
      institutionName: details.institutionName,
      mask: details.mask,
    });

    platformEventBus.publish({
      type: 'plaid_bank_connected',
      category: 'integration',
      title: 'Org Payroll Funding Account Connected',
      description: `${details.institutionName} (...${details.mask}) connected as payroll ACH funding source via Plaid`,
      workspaceId,
      metadata: { itemId, mask: details.mask, institutionName: details.institutionName, connectedBy: userId },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      institutionName: details.institutionName,
      mask: details.mask,
      accountName: details.accountName,
    });
  } catch (err: unknown) {
    log.error('[PlaidRoutes] exchange/org error:', sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.delete('/org-bank', requireAuth, async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);
    const [prior] = await db
      .select({ plaidInstitutionName: orgFinanceSettings.plaidInstitutionName, plaidAccountLast4: orgFinanceSettings.plaidAccountLast4 })
      .from(orgFinanceSettings)
      .where(eq(orgFinanceSettings.workspaceId, workspaceId))
      .limit(1);

    await db
      .update(orgFinanceSettings)
      .set({
        plaidAccessTokenEncrypted: null,
        plaidItemId: null,
        plaidAccountId: null,
        plaidAccountLast4: null,
        plaidAccountName: null,
        plaidInstitutionName: null,
        plaidBankConnectedAt: null,
        plaidBankConnectedBy: null,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(orgFinanceSettings.workspaceId, workspaceId));

    platformEventBus.publish({
      type: 'plaid_bank_disconnected',
      category: 'integration',
      title: 'Org Payroll Funding Account Disconnected',
      description: `${prior?.plaidInstitutionName || 'Bank'} (...${prior?.plaidAccountLast4 || '????'}) disconnected — ACH payroll disbursement suspended until reconnected`,
      workspaceId,
      metadata: { disconnectedBy: userId, priorInstitution: prior?.plaidInstitutionName, priorMask: prior?.plaidAccountLast4 },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/link-token/employee/:employeeId', requireAuth, async (req, res) => {
  try {
    if (!isPlaidConfigured()) {
      return res.status(503).json({ error: 'Plaid is not configured on this server' });
    }
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);
    const { employeeId } = req.params;

    const emp = await db
      .select({ id: employees.id, workspaceId: employees.workspaceId })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!emp.length) return res.status(404).json({ error: 'Employee not found' });

    const result = await createLinkToken({ userId, workspaceId, purpose: 'employee_dd' });
    res.json(result);
  } catch (err: unknown) {
    log.error('[PlaidRoutes] link-token/employee error:', sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post('/exchange/employee/:employeeId', requireAuth, async (req, res) => {
  try {
    const { publicToken } = req.body;
    if (!publicToken) return res.status(400).json({ error: 'publicToken required' });
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);
    const { employeeId } = req.params;

    const emp = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (!emp.length) return res.status(404).json({ error: 'Employee not found' });

    const { accessToken, itemId } = await exchangePublicToken(publicToken);
    const details = await getAccountDetails(accessToken);
    const encrypted = plaidEncrypt(accessToken);

    const existing = await db
      .select({ id: employeeBankAccounts.id })
      .from(employeeBankAccounts)
      .where(and(
        eq(employeeBankAccounts.workspaceId, workspaceId),
        eq(employeeBankAccounts.employeeId, employeeId),
        eq(employeeBankAccounts.isPrimary, true),
      ))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(employeeBankAccounts)
        .set({
          plaidAccessTokenEncrypted: encrypted,
          plaidItemId: itemId,
          plaidAccountId: details.accountId,
          plaidMask: details.mask,
          plaidInstitutionName: details.institutionName,
          bankName: details.institutionName,
          accountType: details.accountType === 'savings' ? 'savings' : 'checking',
          accountNumberLast4: details.mask,
          isVerified: true,
          verifiedAt: new Date(),
          verifiedBy: userId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(and(
          eq(employeeBankAccounts.workspaceId, workspaceId),
          eq(employeeBankAccounts.employeeId, employeeId),
          eq(employeeBankAccounts.isPrimary, true),
        ));
    } else {
      await db.insert(employeeBankAccounts).values({
        workspaceId,
        employeeId,
        bankName: details.institutionName,
        accountType: details.accountType === 'savings' ? 'savings' : 'checking',
        accountNumberLast4: details.mask,
        isPrimary: true,
        isActive: true,
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: userId,
        plaidAccessTokenEncrypted: encrypted,
        plaidItemId: itemId,
        plaidAccountId: details.accountId,
        plaidMask: details.mask,
        plaidInstitutionName: details.institutionName,
        depositType: 'full',
        addedBy: userId,
      });
    }

    broadcastToWorkspace(workspaceId, {
      type: 'employee_bank_connected',
      employeeId,
      institutionName: details.institutionName,
      mask: details.mask,
    });

    platformEventBus.publish({
      type: 'plaid_employee_bank_linked',
      category: 'integration',
      title: 'Employee Direct Deposit Account Linked',
      description: `${details.institutionName} (...${details.mask}) linked for employee ${employeeId} — ACH payroll ready`,
      workspaceId,
      metadata: { employeeId, itemId, mask: details.mask, institutionName: details.institutionName, linkedBy: userId },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({
      success: true,
      institutionName: details.institutionName,
      mask: details.mask,
      accountName: details.accountName,
    });
  } catch (err: unknown) {
    log.error('[PlaidRoutes] exchange/employee error:', sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/employee/:employeeId/bank-status', requireAuth, async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { employeeId } = req.params;

    const accounts = await db
      .select({
        id: employeeBankAccounts.id,
        bankName: employeeBankAccounts.bankName,
        accountType: employeeBankAccounts.accountType,
        accountNumberLast4: employeeBankAccounts.accountNumberLast4,
        plaidItemId: employeeBankAccounts.plaidItemId,
        plaidMask: employeeBankAccounts.plaidMask,
        plaidInstitutionName: employeeBankAccounts.plaidInstitutionName,
        isVerified: employeeBankAccounts.isVerified,
        isPrimary: employeeBankAccounts.isPrimary,
        isActive: employeeBankAccounts.isActive,
      })
      .from(employeeBankAccounts)
      .where(and(
        eq(employeeBankAccounts.workspaceId, workspaceId),
        eq(employeeBankAccounts.employeeId, employeeId),
        eq(employeeBankAccounts.isActive, true),
      ));

    res.json({
      connected: accounts.some(a => !!a.plaidItemId),
      accounts: accounts.map(a => ({
        ...a,
        plaidConnected: !!a.plaidItemId,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get('/transfers/:payStubId', requireAuth, async (req, res) => {
  try {
    const workspaceId = getWorkspaceId(req);
    const { payStubId } = req.params;

    const [stub] = await db
      .select({
        id: payStubs.id,
        employeeId: payStubs.employeeId,
        netPay: payStubs.netPay,
        plaidTransferId: payStubs.plaidTransferId,
        plaidTransferStatus: payStubs.plaidTransferStatus,
        plaidTransferFailureReason: payStubs.plaidTransferFailureReason,
      })
      .from(payStubs)
      .where(and(eq(payStubs.id, payStubId), eq(payStubs.workspaceId, workspaceId)))
      .limit(1);

    if (!stub) return res.status(404).json({ error: 'Pay stub not found' });

    res.json(stub);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
