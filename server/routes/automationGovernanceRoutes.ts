import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { employees, workspaces, automationActionLedger } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { logActionAudit } from "../services/ai-brain/actionAuditLogger";

const router = Router();

const checkWorkspaceAccess = async (userId: string, workspaceId: string): Promise<{ hasAccess: boolean; role?: string }> => {
  const [employee] = await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))).limit(1);
  if (employee) return { hasAccess: true, role: employee.workspaceRole || 'staff' };
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (workspace?.ownerId === userId) return { hasAccess: true, role: 'org_owner' };
  return { hasAccess: false };
};

router.get("/policy/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const { workspaceId } = req.params;
    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    const policy = await automationGovernanceService.getOrCreatePolicy(workspaceId);
    res.json({ success: true, policy });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.patch("/policy/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const { workspaceId } = req.params;
    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    if (!['org_owner', 'co_owner'].includes(access.role || '')) {
      return res.status(403).json({ success: false, error: "Only org owners and admins can modify automation policies" });
    }
    const allowedFields = ['currentLevel', 'handHeldThreshold', 'graduatedThreshold', 'highRiskCategories', 'minConfidenceForAutoExecute'];
    const sanitizedBody: Record<string, any> = { workspaceId };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) sanitizedBody[field] = req.body[field];
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const policy = await automationGovernanceService.updatePolicy(sanitizedBody);
    if (!policy) return res.status(404).json({ success: false, error: "Policy not found" });

    logActionAudit({
      actionId: 'governance.update_policy',
      workspaceId,
      userId: typeof userId === 'string' ? userId : (userId as any)?.id,
      entityType: 'automation_governance_policy',
      entityId: workspaceId,
      success: true,
      message: 'Automation governance policy updated',
      payload: sanitizedBody,
      changesAfter: sanitizedBody,
    }).catch(() => {});

    res.json({ success: true, policy });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/consent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const userId = req.user!;
    const { workspaceId, consentType, sourceContext, waiverVersion } = req.body;
    if (!workspaceId || !consentType) return res.status(400).json({ success: false, error: "workspaceId and consentType required" });
    if (typeof consentType !== 'string' || consentType.length > 100) return res.status(400).json({ success: false, error: "Invalid consentType" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const consent = await automationGovernanceService.grantUserConsent({ userId, workspaceId, consentType, sourceContext: sourceContext?.substring(0, 500), waiverVersion });
    if (!consent) return res.status(500).json({ success: false, error: "Failed to grant consent" });

    logActionAudit({
      actionId: 'governance.grant_user_consent',
      workspaceId,
      userId: typeof userId === 'string' ? userId : (userId as any)?.id,
      entityType: 'automation_user_consent',
      entityId: (consent as any)?.id,
      success: true,
      message: `User consent granted: ${consentType}`,
      payload: { consentType, waiverVersion },
    }).catch(() => {});

    res.json({ success: true, consent });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/consents/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const userId = req.user!;
    const { workspaceId } = req.params;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const consents = await automationGovernanceService.getUserConsents(userId, workspaceId);
    res.json({ success: true, consents });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/org-consent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const userId = req.user!;
    const { workspaceId, waiverVersion } = req.body;
    if (!workspaceId) return res.status(400).json({ success: false, error: "workspaceId required" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    if (access.role !== 'org_owner') {
      return res.status(403).json({ success: false, error: "Only organization owners can grant org-level automation consent" });
    }
    const policy = await automationGovernanceService.updatePolicy({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId, orgOwnerConsent: true, orgOwnerConsentUserId: userId,
      waiverAccepted: true, waiverVersion: waiverVersion || "1.0",
    });
    if (!policy) return res.status(500).json({ success: false, error: "Failed to record org consent" });

    logActionAudit({
      actionId: 'governance.grant_org_consent',
      workspaceId,
      userId: typeof userId === 'string' ? userId : (userId as any)?.id,
      entityType: 'automation_governance_policy',
      entityId: workspaceId,
      success: true,
      message: 'Org-level automation consent granted',
      payload: { waiverVersion: waiverVersion || '1.0' },
      changesAfter: { orgOwnerConsent: true, waiverAccepted: true },
    }).catch(() => {});

    res.json({ success: true, policy });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/ledger/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const { workspaceId } = req.params;
    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    if (!['org_owner', 'co_owner', 'department_manager'].includes(access.role || '')) {
      return res.status(403).json({ success: false, error: "Insufficient permissions to view automation ledger" });
    }
    const { status, approvalState, limit, offset } = req.query;
    const parsedLimit = Math.min(parseInt(limit as string) || 50, 100);
    const parsedOffset = parseInt(offset as string) || 0;
    const entries = await automationGovernanceService.getLedgerEntries(workspaceId, {
      status: status as string, approvalState: approvalState as string,
      limit: parsedLimit, offset: parsedOffset,
    });
    res.json({ success: true, entries, count: entries.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/pending-approvals/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const { workspaceId } = req.params;
    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    if (!['org_owner', 'co_owner', 'department_manager', 'supervisor'].includes(access.role || '')) {
      return res.status(403).json({ success: false, error: "Insufficient permissions to view pending approvals" });
    }
    const approvals = await automationGovernanceService.getPendingApprovals(workspaceId);
    res.json({ success: true, approvals, count: approvals.length });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/approve/:ledgerEntryId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const userId = req.user!;
    const { ledgerEntryId } = req.params;
    const { notes } = req.body;
    const [entry] = await db.select().from(automationActionLedger).where(eq(automationActionLedger.id, ledgerEntryId)).limit(1);
    if (!entry) return res.status(404).json({ success: false, error: "Ledger entry not found" });
    if (!entry.workspaceId) return res.status(400).json({ success: false, error: "Entry has no workspace" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, entry.workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied" });
    if (!['org_owner', 'co_owner', 'department_manager'].includes(access.role || '')) {
      return res.status(403).json({ success: false, error: "Insufficient permissions to approve actions" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const success = await automationGovernanceService.approveLedgerEntry(ledgerEntryId, userId, notes?.substring(0, 500));

    logActionAudit({
      actionId: 'governance.approve_action',
      workspaceId: entry.workspaceId,
      userId: typeof userId === 'string' ? userId : (userId as any)?.id,
      entityType: 'automation_action_ledger',
      entityId: ledgerEntryId,
      success: !!success,
      message: `Governance approval: ${entry.actionName || ledgerEntryId}`,
      payload: { notes: notes?.substring(0, 500) },
      changesBefore: { approvalState: entry.approvalState },
      changesAfter: { approvalState: 'approved' },
    }).catch(() => {});

    res.json({ success });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/reject/:ledgerEntryId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const userId = req.user!;
    const { ledgerEntryId } = req.params;
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string') return res.status(400).json({ success: false, error: "Rejection reason required" });
    const [entry] = await db.select().from(automationActionLedger).where(eq(automationActionLedger.id, ledgerEntryId)).limit(1);
    if (!entry) return res.status(404).json({ success: false, error: "Ledger entry not found" });
    if (!entry.workspaceId) return res.status(400).json({ success: false, error: "Entry has no workspace" });
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, entry.workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied" });
    if (!['org_owner', 'co_owner', 'department_manager'].includes(access.role || '')) {
      return res.status(403).json({ success: false, error: "Insufficient permissions to reject actions" });
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const success = await automationGovernanceService.rejectLedgerEntry(ledgerEntryId, userId, reason.substring(0, 500));

    logActionAudit({
      actionId: 'governance.reject_action',
      workspaceId: entry.workspaceId,
      userId: typeof userId === 'string' ? userId : (userId as any)?.id,
      entityType: 'automation_action_ledger',
      entityId: ledgerEntryId,
      success: !!success,
      message: `Governance rejection: ${entry.actionName || ledgerEntryId}`,
      payload: { reason: reason.substring(0, 500) },
      changesBefore: { approvalState: entry.approvalState },
      changesAfter: { approvalState: 'rejected', executionStatus: 'cancelled' },
    }).catch(() => {});

    res.json({ success });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/metrics/:workspaceId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { automationGovernanceService } = await import("../services/ai-brain/automationGovernanceService");
    const { workspaceId } = req.params;
    const userId = req.user!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const access = await checkWorkspaceAccess(userId, workspaceId);
    if (!access.hasAccess) return res.status(403).json({ success: false, error: "Access denied to this workspace" });
    if (!['org_owner', 'co_owner'].includes(access.role || '')) {
      return res.status(403).json({ success: false, error: "Insufficient permissions to view metrics" });
    }
    const { daysBack } = req.query;
    const parsedDaysBack = Math.min(Math.max(parseInt(daysBack as string) || 30, 1), 365);
    const metrics = await automationGovernanceService.getGovernanceMetrics(workspaceId, parsedDaysBack);
    res.json({ success: true, metrics });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
