import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { supportActionsService } from '../services/supportActionsService';
import { requireAuth } from '../auth';
import { getUserPlatformRole, getPlatformRoleLevel, PLATFORM_ROLE_HIERARCHY, type AuthenticatedRequest as RbacAuthenticatedRequest } from '../rbac';
import { tokenManager } from '../services/billing/tokenManager';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
import { executeSupportAction, listSupportActions, SupportActionType } from '../services/helpai/supportActionRegistry';
const log = createLogger('SupportActionRoutes');


interface AuthenticatedRequest extends RbacAuthenticatedRequest {
  userId?: string;
}

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];

const targetUserSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
});

const targetEmailSchema = z.object({
  targetEmail: z.string().email('Invalid email format'),
});

const lockAccountSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
  reason: z.string().optional(),
});

const resetEmailSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
  newEmail: z.string().email('Invalid email format'),
});

async function requireSupportRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = req.userId || req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const platformRole = req.platformRole || await getUserPlatformRole(userId);
  if (!platformRole || !SUPPORT_ROLES.includes(platformRole)) {
    return res.status(403).json({ error: 'Support role required' });
  }

  req.supportExecutorId = userId;
  req.executorPlatformRole = platformRole;
  req.executorLevel = getPlatformRoleLevel(platformRole);
  next();
}

function requireSupportExecutor(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.supportExecutorId) {
    res.status(401).json({ error: 'Support executor context missing' });
    return null;
  }
  return req.supportExecutorId;
}

const router = Router();

router.get('/api/support/actions/available', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const platformRole = req.executorPlatformRole;
    const executorLevel = req.executorLevel || 0;

    const actions = [
      { id: 'view_user_info', label: 'View User Info', icon: 'Eye', category: 'info', minLevel: 2 },
      { id: 'reset_password', label: 'Reset Password', icon: 'KeyRound', category: 'account', minLevel: 3 },
      { id: 'lock_account', label: 'Lock Account', icon: 'Lock', category: 'account', minLevel: 4 },
      { id: 'unlock_account', label: 'Unlock Account', icon: 'Unlock', category: 'account', minLevel: 3 },
      { id: 'freeze_user', label: 'Freeze User', icon: 'Snowflake', category: 'account', minLevel: 4 },
      { id: 'unfreeze_user', label: 'Unfreeze User', icon: 'Sun', category: 'account', minLevel: 3 },
      { id: 'suspend_employee', label: 'Suspend Employee', icon: 'UserMinus', category: 'account', minLevel: 4 },
      { id: 'reactivate_employee', label: 'Reactivate Employee', icon: 'UserPlus', category: 'account', minLevel: 3 },
      { id: 'revoke_sessions', label: 'Revoke All Sessions', icon: 'LogOut', category: 'security', minLevel: 5, needsApprovalBelow: 6 },
      { id: 'reset_email', label: 'Reset Email', icon: 'Mail', category: 'account', minLevel: 5, needsApprovalBelow: 6 },
      { id: 'topoff_credits', label: 'Top-off Credits', icon: 'PlusCircle', category: 'billing', minLevel: 2, needsApprovalBelow: 4, isFinancial: true, description: 'Agent: 2K max | Manager: 10K max | Root/Deputy: 50K max' },
      { id: 'refund_credits', label: 'Refund Credits', icon: 'RefreshCw', category: 'billing', minLevel: 5, needsApprovalBelow: 6, isFinancial: true },
      { id: 'issue_discount', label: 'Issue Discount', icon: 'Percent', category: 'billing', minLevel: 2, needsApprovalBelow: 4, isFinancial: true },
      { id: 'process_refund', label: 'Process Refund', icon: 'DollarSign', category: 'billing', minLevel: 5, needsApprovalBelow: 7, isFinancial: true },
      { id: 'adjust_billing', label: 'Adjust Billing', icon: 'CreditCard', category: 'billing', minLevel: 5, needsApprovalBelow: 6, isFinancial: true },
      { id: 'view_service_status', label: 'View Service Status', icon: 'Activity', category: 'services', minLevel: 3 },
      { id: 'suspend_service', label: 'Suspend Service', icon: 'Power', category: 'services', minLevel: 4 },
      { id: 'restore_service', label: 'Restore Service', icon: 'Play', category: 'services', minLevel: 3 },
      { id: 'view_org_data', label: 'View Org Data', icon: 'Database', category: 'data', minLevel: 3 },
      { id: 'platform_scan', label: 'Platform Scan', icon: 'Scan', category: 'intelligence', minLevel: 4 },
    ];

    const available = actions
      .filter(a => executorLevel >= a.minLevel)
      .map(a => ({
        ...a,
        needsApproval: a.needsApprovalBelow ? executorLevel < a.needsApprovalBelow : false,
      }));

    res.json({ actions: available, platformRole, executorLevel });
  } catch (error) {
    log.error('[SupportActions API] Error getting available actions:', error);
    res.status(500).json({ error: 'Failed to get available actions' });
  }
});

router.post('/api/support/actions/view-user', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = targetUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const executorId = requireSupportExecutor(req, res);
    if (!executorId) return;
    const result = await supportActionsService.getUserInfo(executorId, parsed.data.targetUserId);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] View user error:', error);
    res.status(500).json({ error: 'Failed to view user info' });
  }
});

router.post('/api/support/actions/reset-password', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = targetEmailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const executorId = requireSupportExecutor(req, res);
    if (!executorId) return;
    const result = await supportActionsService.resetPassword(executorId, parsed.data.targetEmail);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.post('/api/support/actions/lock-account', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = lockAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const executorId = requireSupportExecutor(req, res);
    if (!executorId) return;
    const result = await supportActionsService.lockAccount(executorId, parsed.data.targetUserId, parsed.data.reason);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Lock account error:', error);
    res.status(500).json({ error: 'Failed to lock account' });
  }
});

router.post('/api/support/actions/unlock-account', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = targetUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const executorId = requireSupportExecutor(req, res);
    if (!executorId) return;
    const result = await supportActionsService.unlockAccount(executorId, parsed.data.targetUserId);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Unlock account error:', error);
    res.status(500).json({ error: 'Failed to unlock account' });
  }
});

router.post('/api/support/actions/revoke-sessions', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = targetUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const executorId = requireSupportExecutor(req, res);
    if (!executorId) return;
    const result = await supportActionsService.revokeSessions(executorId, parsed.data.targetUserId);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Revoke sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

router.post('/api/support/actions/reset-email', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = resetEmailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const executorId = requireSupportExecutor(req, res);
    if (!executorId) return;
    const result = await supportActionsService.resetEmail(executorId, parsed.data.targetUserId, parsed.data.newEmail);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Reset email error:', error);
    res.status(500).json({ error: 'Failed to reset email' });
  }
});

const refundCreditsSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId is required'),
  amount: z.number().int().positive('Amount must be a positive integer').max(50000, 'Maximum refund is 50,000 credits'),
  reason: z.string().min(3, 'Reason is required (min 3 characters)').max(500),
});

const issueDiscountSchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId is required'),
  discountPercent: z.number().min(1).max(15, 'Maximum discount is 15%'),
  reason: z.string().min(3, 'Reason is required').max(500),
});

router.post('/api/support/actions/refund-credits', requireAuth, requireSupportRole, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Credit refunds are retired. Apply a Stripe invoice credit or billing adjustment on the next monthly invoice instead.',
  });
});

// Credit top-off is retired. AI usage is billed as token overage on the
// monthly Stripe invoice; goodwill gestures should be applied as a Stripe
// invoice credit rather than a balance top-off.
router.post('/api/support/actions/topoff-credits', requireAuth, requireSupportRole, async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'Credit top-off is retired. Apply a Stripe invoice credit for goodwill gestures.',
  });
});

router.post('/api/support/actions/issue-discount', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const executorLevel = req.executorLevel || 0;
    const executorRole = req.executorPlatformRole;

    const parsed = issueDiscountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.errors[0].message });

    const { discountPercent } = parsed.data;

    if (discountPercent > 10 && executorLevel < 4) {
      return res.status(403).json({
        success: false,
        error: 'Discounts above 10% require manager approval. Please request approval from a manager or deputy admin.',
        needsApproval: true,
      });
    }

    const executorId = req.supportExecutorId;

    res.json({
      success: true,
      message: `${discountPercent}% discount issued successfully`,
      discount: {
        workspaceId: parsed.data.workspaceId,
        percent: discountPercent,
        reason: parsed.data.reason,
        issuedBy: executorId,
        issuedByRole: executorRole,
        issuedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error('[SupportActions API] Issue discount error:', error);
    res.status(500).json({ success: false, error: 'Failed to issue discount' });
  }
});

router.get('/api/support/actions/credit-history/:workspaceId', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const executorLevel = req.executorLevel || 0;
    if (executorLevel < 5) {
      return res.status(403).json({ error: 'Insufficient permissions to view token usage history' });
    }

    const { workspaceId } = req.params;
    const usage = await tokenManager.getUsageHistory(workspaceId, 200);
    const balance = await tokenManager.getBalance(workspaceId);

    res.json({ history: usage, currentBalance: balance });
  } catch (error) {
    log.error('[SupportActions API] Token usage history error:', error);
    res.status(500).json({ error: 'Failed to get token usage history' });
  }
});

router.post('/api/support/actions/approve', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const schema = z.object({ approvalId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const approverId = requireSupportExecutor(req, res);
    if (!approverId) return;
    const result = await supportActionsService.approveAction(parsed.data.approvalId, approverId);
    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Approve action error:', error);
    res.status(500).json({ error: 'Failed to approve action' });
  }
});

// ============================================================================
// POST /api/support/actions/execute — Unified corrective action dispatcher
// ============================================================================
const executeSchema = z.object({
  actionType: z.string().min(1),
  workspaceId: z.string().min(1),
  targetEntityType: z.string().min(1),
  targetEntityId: z.string().optional(),
  reason: z.string().min(1, 'A documented reason is required for all support actions'),
  correctionData: z.record(z.any()).optional(),
  overrideData: z.record(z.any()).optional(),
  ticketId: z.string().optional()
});

router.post('/api/support/actions/execute', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const actorId = req.supportExecutorId || req.userId || 'unknown';
    const actorRole = req.executorPlatformRole || 'support_agent';
    const actorType = actorRole === 'system' ? 'trinity' : 'support_agent';

    const result = await executeSupportAction({
      actionType: parsed.data.actionType as SupportActionType,
      workspaceId: parsed.data.workspaceId,
      targetEntityType: parsed.data.targetEntityType,
      targetEntityId: parsed.data.targetEntityId,
      reason: parsed.data.reason,
      actorId,
      actorType,
      ticketId: parsed.data.ticketId,
      correctionData: parsed.data.correctionData,
      overrideData: parsed.data.overrideData
    });

    if (!result.success) {
      return res.status(422).json(result);
    }

    res.json(result);
  } catch (error) {
    log.error('[SupportActions API] Execute action error:', error);
    res.status(500).json({ error: 'Failed to execute support action' });
  }
});

// GET /api/support/actions/registry — List all available support actions
router.get('/api/support/actions/registry', requireAuth, requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  res.json(listSupportActions());
});

export default router;
