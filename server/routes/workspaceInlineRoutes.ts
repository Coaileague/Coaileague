import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { requireAuth } from "../auth";
import { getUserPlatformRole, hasPlatformWideAccess, resolveWorkspaceForUser, type AuthenticatedRequest } from "../rbac";
import {
  workspaces,
  externalIdentifiers,
  insertWorkspaceSchema,
  partnerConnections,
  employees,
} from "@shared/schema";
import { sql, eq, and } from "drizzle-orm";
import { mutationLimiter } from '../middleware/rateLimiter';
import { creditManager } from '../services/billing/creditManager';
import { seedAnchor } from '../services/utils/scheduling';
import { typedQuery } from '../lib/typedSql';
import { sumFinancialValues, applyTax, toFinancialString } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
const log = createLogger('WorkspaceInlineRoutes');


const router = Router();

function redactSensitiveWorkspaceFields(workspace: any, platformRole?: string): any {
    if (platformRole === 'root_admin') {
      return workspace;
    }

    const {
      adminNotes,
      adminFlags,
      billingOverrideType,
      billingOverrideDiscountPercent,
      billingOverrideCustomPrice,
      billingOverrideReason,
      billingOverrideAppliedBy,
      billingOverrideAppliedAt,
      billingOverrideExpiresAt,
      lastAdminAction,
      lastAdminActionBy,
      lastAdminActionAt,
      ...safeWorkspace
    } = workspace;

    return safeWorkspace;
  }

async function applyAutomationUpdate(params: {
    workspaceId: string;
    validated: any;
    scheduleField: 'invoiceSchedule' | 'payrollSchedule' | 'scheduleGenerationInterval';
    dayOfWeekField: 'invoiceDayOfWeek' | 'payrollDayOfWeek' | 'scheduleDayOfWeek';
    anchorField: 'invoiceBiweeklyAnchor' | 'payrollBiweeklyAnchor' | 'scheduleBiweeklyAnchor';
  }) {
    const { workspaceId, validated, scheduleField, dayOfWeekField, anchorField } = params;
    
    const currentWorkspace = await storage.getWorkspace(workspaceId);
    if (!currentWorkspace) {
      throw new Error('Workspace not found');
    }
    
    const newSchedule = validated[scheduleField];
    const currentSchedule = currentWorkspace[scheduleField];
    const currentAnchor = currentWorkspace[anchorField];
    
    const shouldSeedAnchor = (
      newSchedule === 'biweekly' &&
      (currentSchedule !== 'biweekly' || !currentAnchor)
    );
    
    if (shouldSeedAnchor) {
      const dayOfWeek = validated[dayOfWeekField] ?? currentWorkspace[dayOfWeekField] ?? 1;
      const anchor = seedAnchor(dayOfWeek, new Date());
      validated[anchorField] = anchor;
    }
    
    return await db.transaction(async (tx) => {
      const [updated] = await tx.update(workspaces)
        .set(validated)
        .where(eq(workspaces.id, workspaceId))
        .returning();
      return updated;
    });
  }

  router.post('/switch/:workspaceId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { workspaceId } = req.params;
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      const platformRole = req.platformRole || await getUserPlatformRole(userId);
      const isPlatformStaffUser = platformRole && hasPlatformWideAccess(platformRole);

      if (!isPlatformStaffUser && workspace.ownerId !== userId) {
        const employee = await storage.getEmployeeByUserId(userId, workspaceId);
        if (!employee) {
          if (workspace.isSubOrg && workspace.parentWorkspaceId) {
            const parentWs = await storage.getWorkspace(workspace.parentWorkspaceId);
            if (!parentWs || parentWs.ownerId !== userId) {
              return res.status(403).json({ message: 'Access denied to this workspace' });
            }
          } else {
            const subOrgs = await db.select({ id: workspaces.id }).from(workspaces)
              .where(and(eq(workspaces.parentWorkspaceId, workspaceId), eq(workspaces.isSubOrg, true)));
            if (subOrgs.length === 0) {
              return res.status(403).json({ message: 'Access denied to this workspace' });
            }
          }
        }
      }
      
      await storage.updateUser(userId, {
        currentWorkspaceId: workspaceId,
      });
      
      // SECURITY: Regenerate session ID on workspace switch to prevent session fixation.
      // An attacker who obtained the pre-switch session token must not be able to
      // use it after the switch — the new session ID invalidates the old one.
      const preservedUserId = userId;
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      // Restore the authenticated user identity into the freshly-generated session
      req.session.userId = preservedUserId;

      const { resolveAndCacheWorkspaceContext, saveSessionAsync } = await import('../services/session/sessionWorkspaceService');
      await resolveAndCacheWorkspaceContext(req, userId, workspaceId);
      await saveSessionAsync(req);
      
      res.json({ success: true, workspaceId, workspaceName: workspace.name });
    } catch (error) {
      log.error('Error switching workspace:', error);
      res.status(500).json({ message: 'Failed to switch workspace' });
    }
  });

  router.get('/health', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const userId = req.user?.id || (req.user)?.claims?.sub;
        if (userId) {
          const { getUserPlatformRole, hasPlatformWideAccess } = await import('../rbac');
          const platformRole = await getUserPlatformRole(userId);
          if (hasPlatformWideAccess(platformRole)) {
            return res.json({
              overallStatus: 'green',
              statusMessage: 'Platform staff - full access',
              billingActive: true,
              subscriptionTier: 'enterprise',
              integrations: { quickbooks: 'platform', gusto: 'platform' },
              isPlatformStaff: true,
            });
          }
        }
        return res.status(400).json({ error: 'No workspace selected' });
      }

      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      const qboConnection = await db.select().from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks')
        ))
        .limit(1);

      const gustoConnection = await db.select().from(partnerConnections)
        .where(and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'gusto')
        ))
        .limit(1);

      const billingActive = workspace.subscriptionStatus === 'active';
      const hasExternalIntegrations = qboConnection.length > 0 || gustoConnection.length > 0;

      // Check if the workspace is using internal workforce management (active employees
      // indicate that internal payroll/scheduling is already in use, so we should not
      // prompt to connect external integrations like QuickBooks or Gusto).
      const [activeEmployeeCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
      const hasInternalSystems = (activeEmployeeCount?.count ?? 0) > 0;

      const hasIntegrations = hasExternalIntegrations || hasInternalSystems;

      let overallStatus: 'green' | 'yellow' | 'red' = 'green';
      let statusMessage = 'Your workspace is running smoothly';

      if (!billingActive) {
        overallStatus = 'red';
        statusMessage = 'Billing issue - please update payment method';
      } else if (!hasIntegrations) {
        overallStatus = 'yellow';
        statusMessage = 'Connect QuickBooks or Gusto to enable automation';
      }

      res.json({
        status: overallStatus,
        message: statusMessage,
        billing: {
          status: workspace.subscriptionStatus || 'inactive',
          active: billingActive,
        },
        integrations: {
          quickbooks: qboConnection.length > 0 ? 'connected' : 'not_connected',
          quickbooksRealmId: qboConnection.length > 0 ? qboConnection[0].realmId : null,
          gusto: gustoConnection.length > 0 ? 'connected' : 'not_connected',
        },
        automations: {
          invoicing: qboConnection.length > 0 || hasInternalSystems,
          payroll: gustoConnection.length > 0 || hasInternalSystems,
          scheduling: true,
        },
        internalSystems: {
          hasInternalPayroll: hasInternalSystems,
          hasInternalInvoicing: hasInternalSystems,
          hasInternalScheduling: hasInternalSystems,
        },
        safeToRun: billingActive && hasIntegrations,
      });
    } catch (error) {
      log.error('Workspace health check error:', error);
      res.status(500).json({ error: 'Failed to check workspace health' });
    }
  });

  router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'No workspace selected' });
      }

      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      type OrgStatusType = 'active' | 'suspended_payment' | 'suspended_violation' | 'suspended_other' | 'maintenance' | 'restricted' | 'trial_ending' | 'trial_expired';
      let status: OrgStatusType = 'active';

      if (workspace.isFrozen) {
        status = 'suspended_payment';
      } else if (workspace.isSuspended) {
        status = 'suspended_violation';
      } else if (workspace.isLocked) {
        status = 'suspended_other';
      }

      res.json({
        workspaceId,
        status,
        statusReason: workspace.suspendedReason || workspace.frozenReason || workspace.lockedReason || null,
        lastChecked: new Date().toISOString(),
        metadata: {},
      });
    } catch (error) {
      log.error('Failed to fetch workspace status:', error);
      res.status(500).json({ error: 'Failed to fetch workspace status' });
    }
  });

  router.get('/custom-messages', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'No workspace selected' });
      }

      res.json({
        workspaceId,
        statusOverrides: {},
        customMessages: {},
      });
    } catch (error) {
      log.error('Failed to fetch custom messages:', error);
      res.status(500).json({ error: 'Failed to fetch custom messages' });
    }
  });

  router.get('/current', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });
      const user = await storage.getUser(userId);
      let workspace = null;
      if (user?.currentWorkspaceId) workspace = await storage.getWorkspace(user.currentWorkspaceId);
      if (!workspace) workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      if (!workspace) return res.status(404).json({ message: 'No workspace found' });
      res.json(workspace);
    } catch (error) {
      log.error('Workspace current error:', error);
      res.status(500).json({ message: 'Failed to get current workspace' });
    }
  });

  router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const user = await storage.getUser(userId);
      let workspace = null;
      
      if (user?.currentWorkspaceId) {
        workspace = await storage.getWorkspace(user.currentWorkspaceId);
      }
      
      if (!workspace) {
        workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      }
      
      if (!workspace) {
        // No workspace found — user must complete onboarding before one is created.
        // Returning null workspace with a redirect hint so the frontend can route
        // them to the org creation flow without silently auto-creating junk data.
        return res.json({ workspace: null, redirect: '/create-org' });
      }
      
      const [orgIdentifier] = await db
        .select()
        .from(externalIdentifiers)
        .where(
          and(
            eq(externalIdentifiers.entityType, 'org'),
            eq(externalIdentifiers.entityId, workspace.id)
          )
        )
        .limit(1);
      
      const platformRole = req.platformRole;
      const safeWorkspace = redactSensitiveWorkspaceFields(workspace, platformRole);
      
      res.json({
        ...safeWorkspace,
        orgCode: orgIdentifier?.externalId || null,
      });
    } catch (error) {
      log.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  router.post("/reactivate", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
      
      if (!workspaceId) {
        return res.status(404).json({ message: "No workspace found" });
      }
      
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace || workspace.ownerId !== userId) {
        return res.status(403).json({ message: "Only the organization owner can reactivate the subscription" });
      }
      
      await db.update(workspaces).set({ subscriptionStatus: "active" }).where(eq(workspaces.id, workspaceId));
      
      
      res.json({ 
        success: true, 
        message: "Subscription reactivated successfully",
        workspaceId,
        status: "active"
      });
    } catch (error) {
      log.error("Error reactivating workspace:", error);
      res.status(500).json({ message: "Failed to reactivate subscription" });
    }
  });

  router.patch('/', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { workspaceId, role, error } = await resolveWorkspaceForUser(userId);
      if (error || !workspaceId) {
        return res.status(404).json({ message: error || "Workspace not found" });
      }

      // Only org owners, co-owners, and admins can update core workspace settings
      if (!['org_owner', 'co_owner', 'org_admin'].includes(role || '')) {
        return res.status(403).json({ message: "Only organization owners and admins can update workspace settings" });
      }

      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const fieldMapping: Record<string, string> = {
        // Core identity
        'name': 'name',
        'website': 'companyWebsite',
        'phone': 'companyPhone',
        'companyName': 'companyName',
        'taxId': 'taxId',
        'address': 'address',
        'logoUrl': 'logoUrl',
        'brandColor': 'brandColor',
        // Company address for invoice headers
        'companyCity': 'companyCity',
        'companyState': 'companyState',
        'companyZip': 'companyZip',
        // Invoice financial configuration
        'invoicePrefix': 'invoicePrefix',
        'invoiceNextNumber': 'invoiceNextNumber',
        'lateFeePercentage': 'lateFeePercentage',
        'lateFeeDays': 'lateFeeDays',
        'billingEmail': 'billingEmail',
        'paymentTermsDays': 'paymentTermsDays',
        'defaultTaxRate': 'defaultTaxRate',
        // Payroll financial configuration
        'stateUnemploymentRate': 'stateUnemploymentRate',
        'workerCompRate': 'workerCompRate',
        'payrollBankName': 'payrollBankName',
        'payrollBankRouting': 'payrollBankRouting',
        'payrollBankAccount': 'payrollBankAccount',
        'payrollMemo': 'payrollMemo',
        // State license
        'stateLicenseNumber': 'stateLicenseNumber',
        'stateLicenseState': 'stateLicenseState',
        'stateLicenseExpiry': 'stateLicenseExpiry',
        'businessCategory': 'businessCategory',
        'industry': 'businessCategory',
        // Timezone & labor configuration
        'timezone': 'timezone',
        'primaryOperatingState': 'primaryOperatingState',
        'operatingStates': 'operatingStates',
        'laborLawJurisdiction': 'laborLawJurisdiction',
        // Overtime thresholds
        'enableDailyOvertime': 'enableDailyOvertime',
        'dailyOvertimeThreshold': 'dailyOvertimeThreshold',
        'weeklyOvertimeThreshold': 'weeklyOvertimeThreshold',
        // Break compliance toggles
        'autoBreakSchedulingEnabled': 'autoBreakSchedulingEnabled',
        'breakComplianceAlerts': 'breakComplianceAlerts',
      };
      
      const filteredData: any = {};
      for (const [frontendKey, backendKey] of Object.entries(fieldMapping)) {
        if (req.body[frontendKey] !== undefined) {
          filteredData[backendKey] = req.body[frontendKey];
        }
      }

      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const validated = insertWorkspaceSchema.partial().parse(filteredData);

      // Phase 7: capture before state for audit trail
      const beforeSnapshot: Record<string, unknown> = {};
      for (const backendKey of Object.values(fieldMapping)) {
        if (backendKey in filteredData) {
          beforeSnapshot[backendKey] = (workspace as any)[backendKey];
        }
      }

      const updated = await storage.updateWorkspace(workspace.id, validated);

      // Phase 7: audit all workspace settings changes unconditionally
      try {
        const { universalAudit } = await import('../services/universalAuditService');
        const auditChanges: Record<string, { old: any; new: any }> = {};
        for (const [key, newVal] of Object.entries(filteredData)) {
          auditChanges[key] = { old: beforeSnapshot[key], new: newVal };
        }
        await universalAudit.log({
          workspaceId: workspace.id,
          actorId: userId,
          actorType: 'user',
          action: 'settings.updated',
          entityType: 'workspace',
          entityId: workspace.id,
          changeType: 'update',
          changes: auditChanges,
          sourceRoute: 'PATCH /api/workspace/settings',
        });
      } catch (_) { /* audit is best-effort */ }
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const safeWorkspace = redactSensitiveWorkspaceFields(updated, (req.user)?.platformRole);
      
      res.json(safeWorkspace);
    } catch (error: unknown) {
      log.error("Error updating workspace:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update workspace" });
    }
  });

  router.patch('/automation/invoicing', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { resolveWorkspaceForUser } = await import("../rbac");
      const { workspaceId, role, error } = await resolveWorkspaceForUser(userId);
      
      if (error || !workspaceId) {
        return res.status(404).json({ message: error || "Workspace not found" });
      }

      if (!['org_owner', 'co_owner'].includes(role || '')) {
        return res.status(403).json({ message: "Only organization owners and admins can update automation settings" });
      }

      const invoicingSchema = insertWorkspaceSchema.pick({
        autoInvoicingEnabled: true,
        invoiceSchedule: true,
        invoiceCustomDays: true,
        invoiceGenerationDay: true,
      }).refine((data) => {
        if (data.invoiceSchedule === 'custom' && !data.invoiceCustomDays) {
          return false;
        }
        return true;
      }, {
        message: "invoiceCustomDays is required when invoiceSchedule is 'custom'",
        path: ["invoiceCustomDays"],
      });

      const validated = invoicingSchema.parse(req.body);
      
      const workspace = await applyAutomationUpdate({
        workspaceId,
        validated,
        scheduleField: 'invoiceSchedule',
        dayOfWeekField: 'invoiceDayOfWeek',
        anchorField: 'invoiceBiweeklyAnchor',
      });

      log.info(`[AUDIT] User ${userId} (${role}) updated invoicing automation for workspace ${workspaceId}`);
      
      res.json(workspace);
    } catch (error: unknown) {
      log.error("Error updating invoicing automation:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update invoicing automation" });
    }
  });

  router.patch('/automation/payroll', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { resolveWorkspaceForUser } = await import("../rbac");
      const { workspaceId, role, error } = await resolveWorkspaceForUser(userId);
      
      if (error || !workspaceId) {
        return res.status(404).json({ message: error || "Workspace not found" });
      }

      if (!['org_owner', 'co_owner'].includes(role || '')) {
        return res.status(403).json({ message: "Only organization owners and admins can update automation settings" });
      }

      const payrollSchema = insertWorkspaceSchema.pick({
        autoPayrollEnabled: true,
        payrollSchedule: true,
        payrollCustomDays: true,
        payrollProcessDay: true,
        payrollCutoffDay: true,
      }).refine((data) => {
        if (data.payrollSchedule === 'custom' && !data.payrollCustomDays) {
          return false;
        }
        return true;
      }, {
        message: "payrollCustomDays is required when payrollSchedule is 'custom'",
        path: ["payrollCustomDays"],
      });

      const validated = payrollSchema.parse(req.body);
      
      const workspace = await applyAutomationUpdate({
        workspaceId,
        validated,
        scheduleField: 'payrollSchedule',
        dayOfWeekField: 'payrollDayOfWeek',
        anchorField: 'payrollBiweeklyAnchor',
      });

      log.info(`[AUDIT] User ${userId} (${role}) updated payroll automation for workspace ${workspaceId}`);
      
      res.json(workspace);
    } catch (error: unknown) {
      log.error("Error updating payroll automation:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update payroll automation" });
    }
  });

  router.patch('/automation/scheduling', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { resolveWorkspaceForUser } = await import("../rbac");
      const { workspaceId, role, error } = await resolveWorkspaceForUser(userId);
      
      if (error || !workspaceId) {
        return res.status(404).json({ message: error || "Workspace not found" });
      }

      if (!['org_owner', 'co_owner'].includes(role || '')) {
        return res.status(403).json({ message: "Only organization owners and admins can update automation settings" });
      }

      const schedulingSchema = insertWorkspaceSchema.pick({
        autoSchedulingEnabled: true,
        scheduleGenerationInterval: true,
        scheduleCustomDays: true,
        scheduleAdvanceNoticeDays: true,
        scheduleGenerationDay: true,
      }).refine((data) => {
        if (data.scheduleGenerationInterval === 'custom' && !data.scheduleCustomDays) {
          return false;
        }
        return true;
      }, {
        message: "scheduleCustomDays is required when scheduleGenerationInterval is 'custom'",
        path: ["scheduleCustomDays"],
      });

      const validated = schedulingSchema.parse(req.body);
      
      const workspace = await applyAutomationUpdate({
        workspaceId,
        validated,
        scheduleField: 'scheduleGenerationInterval',
        dayOfWeekField: 'scheduleDayOfWeek',
        anchorField: 'scheduleBiweeklyAnchor',
      });

      log.info(`[AUDIT] User ${userId} (${role}) updated scheduling automation for workspace ${workspaceId}`);
      
      res.json(workspace);
    } catch (error: unknown) {
      log.error("Error updating scheduling automation:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update scheduling automation" });
    }
  });

  router.get('/theme', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { resolveWorkspaceForUser } = await import("../rbac");
      const { workspaceId, error } = await resolveWorkspaceForUser(userId);
      
      if (error || !workspaceId) {
        return res.json(null);
      }

      const theme = await storage.getWorkspaceTheme(workspaceId);
      res.json(theme);
    } catch (error) {
      log.error("Error fetching workspace theme:", error);
      res.json(null);
    }
  });

  router.post('/seed-form-templates', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { getTemplatesForCategory } = await import("../seedFormTemplates");
      const templates = getTemplatesForCategory(workspace.businessCategory || 'general');
      
      const createdTemplates = [];
      for (const template of templates) {
        const created = await storage.createReportTemplate({
          workspaceId: workspace.id,
          name: template.name,
          description: template.description,
          category: template.category,
          fields: template.fields,
          isSystemTemplate: true,
          isActive: true,
          createdBy: userId,
        });
        createdTemplates.push(created);
      }

      res.json({
        message: `Seeded ${createdTemplates.length} form templates for ${workspace.businessCategory || 'general'} category`,
        templates: createdTemplates
      });
    } catch (error: unknown) {
      log.error("Error seeding form templates:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to seed form templates" });
    }
  });

  router.post('/upgrade', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
      
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      const { tier } = req.body;
      
      const tierConfig: Record<string, { fee: number; name: string; price: number }> = {
        free: { fee: 0, name: "Free Trial", price: 0 },
        starter: { fee: 3, name: "Starter", price: 4999 },
        professional: { fee: 3, name: "Professional", price: 9999 },
        enterprise: { fee: 2, name: "Enterprise", price: 17999 },
      };

      if (!tierConfig[tier]) {
        return res.status(400).json({ message: "Invalid tier selected" });
      }

      const config = tierConfig[tier];

      const updated = await storage.updateWorkspace(workspace.id, {
        subscriptionTier: tier,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        platformFeePercentage: config.fee,
        subscriptionStatus: "active",
      });

      await storage.createPlatformRevenue({
        workspaceId: workspace.id,
        revenueType: "subscription",
        amount: config.price.toString(),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        platformFee: "0",
        description: `Upgraded to ${config.name} tier - $${config.price}/mo`,
      });

      res.json({
        message: `Successfully upgraded to ${config.name} tier`,
        workspace: updated,
      });
    } catch (error: unknown) {
      log.error("Error upgrading workspace:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to upgrade workspace" });
    }
  });

  router.get('/access', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { getUserPlatformRole, isPlatformStaff } = await import('../rbac');
      const platformRole = await getUserPlatformRole(userId);
      const staffStatus = isPlatformStaff({ platformRole });
      
      const { resolveWorkspaceForUser } = await import('../rbac');
      const { workspaceId, role: workspaceRole, error } = await resolveWorkspaceForUser(userId);
      
      if ((!workspaceId || !workspaceRole) && staffStatus) {
        return res.json({
          workspaceId: null,
          workspaceRole: 'staff',
          subscriptionTier: 'enterprise',
          subscriptionStatus: 'active',
          stateLicenseNumber: null,
          stateLicenseState: null,
          platformRole,
          isPlatformStaff: true,
        });
      }
      
      if (!workspaceId || !workspaceRole) {
        return res.status(400).json({ 
          error: error || 'No workspace access found',
          requiresWorkspaceSelection: error?.includes('specify workspaceId'),
        });
      }
      
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
        columns: {
          subscriptionTier: true,
          subscriptionStatus: true,
        },
      });
      
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      let employeePosition: string | null = null;
      try {
        const empRows = await db.select({ position: employees.position })
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)))
          .limit(1);
        if (empRows.length > 0) {
          employeePosition = empRows[0].position || null;
        }
      } catch (err) {
        log.warn('[API] Failed to fetch employee position:', err);
      }
      
      res.json({
        workspaceId,
        workspaceRole,
        subscriptionTier: workspace.subscriptionTier || 'free',
        subscriptionStatus: workspace.subscriptionStatus || 'active',
        platformRole,
        isPlatformStaff: staffStatus,
        employeePosition,
      });
    } catch (error) {
      log.error('[API] Error fetching workspace access:', error);
      res.status(500).json({ message: 'Failed to fetch workspace access' });
    }
  });

  router.get('/usage-summary', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { resolveWorkspaceForUser } = await import('../rbac');
      const { workspaceId, role, error } = await resolveWorkspaceForUser(userId);
      
      if (!workspaceId) {
        return res.status(400).json({ error: error || 'No workspace found' });
      }

      if (role !== 'org_owner' && role !== 'co_owner') {
        return res.status(403).json({ error: 'Insufficient permissions to view usage data' });
      }

      const now = new Date();
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);

      const { costAggregationService } = await import('../services/billing/costAggregation');
      const summary = await costAggregationService.calculateMonthlyCosts(workspaceId, year, month);

      const { hasPlatformWideAccess: hasFullAccess } = await import('../rbac');
      const isPlatformAdmin = await hasFullAccess(userId);
      if (!isPlatformAdmin) {
        const sanitized = {
          workspaceId: summary.workspaceId,
          period: summary.period,
          aiApiCalls: summary.aiApiCalls,
          partnerApiCalls: summary.partnerApiCalls,
          quickbooksApiCalls: summary.quickbooksApiCalls,
          gustoApiCalls: summary.gustoApiCalls,
          stripeApiCalls: summary.stripeApiCalls,
          workspaceTier: summary.workspaceTier,
          generatedAt: summary.generatedAt,
        };
        return res.json(sanitized);
      }
      res.json(summary);
    } catch (error) {
      log.error('[API] Error fetching usage summary:', error);
      res.status(500).json({ message: 'Failed to fetch usage summary' });
    }
  });

  // ============================================================================
  // SUB-ORGANIZATION MANAGEMENT
  // Org owners can create/manage sub-orgs (branches) under their main org.
  // Sub-orgs share parent's subscription tier, credit pool, and caps.
  // ============================================================================

  router.get('/sub-orgs', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { resolveWorkspaceForUser, getUserPlatformRole: getPlatRole, hasPlatformWideAccess: hasPlatAccess } = await import('../rbac');
      const platformRole = await getPlatRole(userId);
      const isPlatStaff = platformRole && hasPlatAccess(platformRole);

      let parentWorkspaceId = req.query.parentId as string | undefined;

      if (!parentWorkspaceId) {
        const { workspaceId } = await resolveWorkspaceForUser(userId);
        parentWorkspaceId = workspaceId || undefined;
      }

      if (!parentWorkspaceId) {
        return res.status(400).json({ error: 'No workspace context found' });
      }

      if (!isPlatStaff) {
        const parentWs = await storage.getWorkspace(parentWorkspaceId);
        if (!parentWs || parentWs.ownerId !== userId) {
          const emp = await storage.getEmployeeByUserId(userId, parentWorkspaceId);
          if (!emp || (emp.workspaceRole !== 'org_owner' && emp.workspaceRole !== 'co_owner')) {
            return res.status(403).json({ error: 'Only org owners can view sub-organizations' });
          }
        }
      }

      const subOrgs = await db.select().from(workspaces)
        .where(and(
          eq(workspaces.parentWorkspaceId, parentWorkspaceId),
          eq(workspaces.isSubOrg, true)
        ));

      const enriched = await Promise.all(subOrgs.map(async (sub) => {
        const emps = await storage.getEmployeesByWorkspace(sub.id);
        const { clients } = await import('@shared/schema');
        const clientList = await db.select().from(clients).where(eq(clients.workspaceId, sub.id));
        return {
          id: sub.id,
          name: sub.name,
          subOrgLabel: sub.subOrgLabel,
          primaryOperatingState: sub.primaryOperatingState,
          operatingStates: sub.operatingStates || [],
          memberCount: emps.length,
          clientCount: clientList.length,
          subscriptionTier: sub.subscriptionTier,
          isSuspended: sub.isSuspended || false,
          isFrozen: sub.isFrozen || false,
          createdAt: sub.createdAt,
          subOrgCreatedAt: sub.subOrgCreatedAt,
        };
      }));

      res.json(enriched);
    } catch (error: unknown) {
      log.error('[SubOrg] Error listing sub-orgs:', error);
      res.status(500).json({ message: 'Failed to list sub-organizations' });
    }
  });

  router.post('/sub-orgs', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { resolveWorkspaceForUser } = await import('../rbac');
      const { workspaceId: currentWsId, role } = await resolveWorkspaceForUser(userId);

      if (!currentWsId) {
        return res.status(400).json({ error: 'No workspace context found' });
      }

      if (role !== 'org_owner' && role !== 'co_owner') {
        const platformRole = await getUserPlatformRole(userId);
        if (!platformRole || !hasPlatformWideAccess(platformRole)) {
          return res.status(403).json({ error: 'Only org owners can create sub-organizations' });
        }
      }

      const parentWs = await storage.getWorkspace(currentWsId);
      if (!parentWs) {
        return res.status(404).json({ error: 'Parent workspace not found' });
      }

      if (parentWs.isSubOrg) {
        return res.status(400).json({ error: 'Cannot create sub-org under another sub-org. Sub-orgs must be direct children of a root org.' });
      }

      const { name, subOrgLabel, primaryOperatingState, operatingStates } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Sub-organization name is required' });
      }

      const existingSubOrgs = await db.select({ id: workspaces.id }).from(workspaces)
        .where(and(
          eq(workspaces.parentWorkspaceId, currentWsId),
          eq(workspaces.isSubOrg, true)
        ));

      const [newSubOrg] = await db.insert(workspaces).values({
        name,
        ownerId: parentWs.ownerId,
        parentWorkspaceId: currentWsId,
        isSubOrg: true,
        subOrgLabel: subOrgLabel || name,
        primaryOperatingState: primaryOperatingState || parentWs.primaryOperatingState || parentWs.stateLicenseState,
        operatingStates: operatingStates || parentWs.operatingStates || [],
        subscriptionTier: parentWs.subscriptionTier,
        subscriptionStatus: parentWs.subscriptionStatus,
        maxEmployees: parentWs.maxEmployees,
        maxClients: parentWs.maxClients,
        companyName: parentWs.companyName,
        businessCategory: parentWs.businessCategory,
        workspaceType: 'business',
        consolidatedBillingEnabled: true,
        subOrgCreditPoolShared: true,
        subOrgCreatedAt: new Date(),
        subOrgCreatedBy: userId,
        stripeCustomerId: parentWs.stripeCustomerId,
        timezone: parentWs.timezone,
        laborLawJurisdiction: primaryOperatingState ? `US-${primaryOperatingState}` : parentWs.laborLawJurisdiction,
        sectorId: parentWs.sectorId,
        industryGroupId: parentWs.industryGroupId,
        subIndustryId: parentWs.subIndustryId,
      }).returning();

      await db.update(workspaces)
        .set({
          subOrgAddonCount: existingSubOrgs.length + 1,
          consolidatedBillingEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, currentWsId));

      if (!parentWs.operatingStates?.length && primaryOperatingState) {
        const parentState = parentWs.stateLicenseState || primaryOperatingState;
        await db.update(workspaces)
          .set({
            operatingStates: [parentState],
            primaryOperatingState: parentState,
          })
          .where(eq(workspaces.id, currentWsId));
      }

      try {
        const { trinityOrgIntelligenceService } = await import('../services/ai-brain/trinityOrgIntelligenceService');
        trinityOrgIntelligenceService.invalidateHierarchyCache(currentWsId);
      } catch { /* non-critical */ }

      try {
        const { emailProvisioningService } = await import('../services/email/emailProvisioningService');
        const emailSlug = (newSubOrg as any).emailSlug || newSubOrg.id.replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase();
        await emailProvisioningService.provisionWorkspaceAddresses(newSubOrg.id, emailSlug);
        log.info(`[SubOrg] Email addresses provisioned for sub-org ${newSubOrg.id}`);
      } catch (emailError: unknown) {
        log.warn(`[SubOrg] Email provisioning failed for sub-org ${newSubOrg.id} (non-fatal):`, emailError);
      }

      res.status(201).json({
        success: true,
        subOrg: {
          id: newSubOrg.id,
          name: newSubOrg.name,
          subOrgLabel: newSubOrg.subOrgLabel,
          primaryOperatingState: newSubOrg.primaryOperatingState,
          operatingStates: newSubOrg.operatingStates,
          parentWorkspaceId: newSubOrg.parentWorkspaceId,
        },
      });
    } catch (error: unknown) {
      log.error('[SubOrg] Error creating sub-org:', error);
      res.status(500).json({ message: 'Failed to create sub-organization' });
    }
  });

  router.get('/org-tree', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { resolveWorkspaceForUser, getUserPlatformRole: getPlatRole, hasPlatformWideAccess: hasPlatAccess } = await import('../rbac');
      const platformRole = await getPlatRole(userId);
      const isPlatStaff = platformRole && hasPlatAccess(platformRole);

      const { workspaceId: currentWsId } = await resolveWorkspaceForUser(userId);
      if (!currentWsId) {
        return res.status(400).json({ error: 'No workspace context found' });
      }

      const currentWs = await storage.getWorkspace(currentWsId);
      if (!currentWs) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      const rootId = currentWs.parentWorkspaceId || currentWsId;
      const rootWs = currentWs.parentWorkspaceId
        ? await storage.getWorkspace(currentWs.parentWorkspaceId)
        : currentWs;

      if (!rootWs) {
        return res.status(404).json({ error: 'Root workspace not found' });
      }

      if (!isPlatStaff && rootWs.ownerId !== userId) {
        const emp = await storage.getEmployeeByUserId(userId, rootId);
        if (!emp || (emp.workspaceRole !== 'org_owner' && emp.workspaceRole !== 'co_owner')) {
          return res.status(403).json({ error: 'Only org owners can view the organization tree' });
        }
      }

      const subOrgs = await db.select().from(workspaces)
        .where(and(
          eq(workspaces.parentWorkspaceId, rootId),
          eq(workspaces.isSubOrg, true)
        ));

      const buildNode = async (ws: any, isRoot: boolean) => {
        const emps = await storage.getEmployeesByWorkspace(ws.id);
        const { clients } = await import('@shared/schema');
        const clientList = await db.select().from(clients).where(eq(clients.workspaceId, ws.id));
        return {
          id: ws.id,
          name: ws.name,
          subOrgLabel: ws.subOrgLabel || (isRoot ? 'Headquarters' : ws.name),
          isRoot,
          isSubOrg: ws.isSubOrg || false,
          primaryOperatingState: ws.primaryOperatingState,
          operatingStates: ws.operatingStates || [],
          memberCount: emps.length,
          clientCount: clientList.length,
          subscriptionTier: ws.subscriptionTier,
          isCurrent: ws.id === currentWsId,
          isSuspended: ws.isSuspended || false,
          isFrozen: ws.isFrozen || false,
        };
      };

      const rootNode = await buildNode(rootWs, true);
      const childNodes = await Promise.all(subOrgs.map(sub => buildNode(sub, false)));

      res.json({
        root: rootNode,
        children: childNodes,
        totalOrgs: 1 + childNodes.length,
        consolidatedBillingEnabled: rootWs.consolidatedBillingEnabled || false,
      });
    } catch (error: unknown) {
      log.error('[SubOrg] Error building org tree:', error);
      res.status(500).json({ message: 'Failed to build organization tree' });
    }
  });

  router.patch('/sub-orgs/:subOrgId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { subOrgId } = req.params;
      const subOrg = await storage.getWorkspace(subOrgId);
      if (!subOrg || !subOrg.isSubOrg || !subOrg.parentWorkspaceId) {
        return res.status(404).json({ error: 'Sub-organization not found' });
      }

      const parentWs = await storage.getWorkspace(subOrg.parentWorkspaceId);
      if (!parentWs) {
        return res.status(404).json({ error: 'Parent workspace not found' });
      }

      const platformRole = await getUserPlatformRole(userId);
      const isPlatStaff = platformRole && hasPlatformWideAccess(platformRole);

      if (!isPlatStaff && parentWs.ownerId !== userId) {
        return res.status(403).json({ error: 'Only the parent org owner can update sub-organizations' });
      }

      const allowedFields = ['name', 'subOrgLabel', 'primaryOperatingState', 'operatingStates'];
      const updates: Record<string, any> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const [updated] = await db.update(workspaces)
        .set(updates)
        .where(eq(workspaces.id, subOrgId))
        .returning();

      try {
        const { trinityOrgIntelligenceService } = await import('../services/ai-brain/trinityOrgIntelligenceService');
        trinityOrgIntelligenceService.invalidateHierarchyCache(subOrg.parentWorkspaceId!);
        trinityOrgIntelligenceService.invalidateHierarchyCache(subOrgId);
      } catch { /* non-critical */ }

      res.json({ success: true, subOrg: updated });
    } catch (error: unknown) {
      log.error('[SubOrg] Error updating sub-org:', error);
      res.status(500).json({ message: 'Failed to update sub-organization' });
    }
  });

  router.post('/sub-orgs/attach', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { resolveWorkspaceForUser } = await import('../rbac');
      const { workspaceId: currentWsId, role } = await resolveWorkspaceForUser(userId);

      if (!currentWsId) return res.status(400).json({ error: 'No workspace context found' });
      if (!role || !['org_owner', 'co_owner'].includes(role)) {
        return res.status(403).json({ error: 'Only org owners can attach sub-organizations' });
      }

      const parentWs = await storage.getWorkspace(currentWsId);
      if (!parentWs) return res.status(404).json({ error: 'Parent workspace not found' });
      if (parentWs.isSubOrg) {
        return res.status(400).json({ error: 'Cannot attach sub-org under another sub-org. Only root orgs can have children.' });
      }

      const { targetWorkspaceId, subOrgLabel } = req.body;
      if (!targetWorkspaceId) return res.status(400).json({ error: 'targetWorkspaceId is required' });
      if (targetWorkspaceId === currentWsId) return res.status(400).json({ error: 'Cannot attach an org to itself' });

      const targetWs = await storage.getWorkspace(targetWorkspaceId);
      if (!targetWs) return res.status(404).json({ error: 'Target workspace not found' });
      if (targetWs.ownerId !== userId) {
        const platformRole = await getUserPlatformRole(userId);
        const isPlatStaff = platformRole && hasPlatformWideAccess(platformRole);
        if (!isPlatStaff) {
          return res.status(403).json({ error: 'You must own both organizations to attach them' });
        }
      }
      if (targetWs.parentWorkspaceId) {
        return res.status(400).json({ error: 'Target workspace is already a sub-org of another organization' });
      }

      const existingSubOrgs = await db.select({ id: workspaces.id }).from(workspaces)
        .where(and(eq(workspaces.parentWorkspaceId, currentWsId), eq(workspaces.isSubOrg, true)));

      const [updated] = await db.update(workspaces)
        .set({
          parentWorkspaceId: currentWsId,
          isSubOrg: true,
          subOrgLabel: subOrgLabel || targetWs.name,
          consolidatedBillingEnabled: true,
          subOrgCreditPoolShared: true,
          subOrgCreatedAt: new Date(),
          subOrgCreatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, targetWorkspaceId))
        .returning();

      await db.update(workspaces)
        .set({
          subOrgAddonCount: existingSubOrgs.length + 1,
          consolidatedBillingEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, currentWsId));

      try {
        const { trinityOrgIntelligenceService } = await import('../services/ai-brain/trinityOrgIntelligenceService');
        trinityOrgIntelligenceService.invalidateHierarchyCache(currentWsId);
        trinityOrgIntelligenceService.invalidateHierarchyCache(targetWorkspaceId);
      } catch { /* non-critical */ }

      log.info(`[SubOrg] Attached workspace ${targetWorkspaceId} as sub-org of ${currentWsId}`);
      res.status(200).json({
        success: true,
        message: `${targetWs.name} attached as a sub-organization`,
        subOrg: { id: updated.id, name: updated.name, subOrgLabel: updated.subOrgLabel, parentWorkspaceId: updated.parentWorkspaceId },
      });
    } catch (error: unknown) {
      log.error('[SubOrg] Error attaching sub-org:', error);
      res.status(500).json({ message: 'Failed to attach sub-organization' });
    }
  });

  router.post('/sub-orgs/:subOrgId/detach', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { subOrgId } = req.params;
      const subOrg = await storage.getWorkspace(subOrgId);
      if (!subOrg || !subOrg.isSubOrg || !subOrg.parentWorkspaceId) {
        return res.status(404).json({ error: 'Sub-organization not found or not linked' });
      }

      const parentWs = await storage.getWorkspace(subOrg.parentWorkspaceId);
      if (!parentWs) return res.status(404).json({ error: 'Parent workspace not found' });

      const platformRole = await getUserPlatformRole(userId);
      const isPlatStaff = platformRole && hasPlatformWideAccess(platformRole);
      if (!isPlatStaff && parentWs.ownerId !== userId) {
        return res.status(403).json({ error: 'Only the parent org owner can detach sub-organizations' });
      }

      await db.update(workspaces)
        .set({ parentWorkspaceId: null, isSubOrg: false, subOrgLabel: null, consolidatedBillingEnabled: false, subOrgCreditPoolShared: false, updatedAt: new Date() })
        .where(eq(workspaces.id, subOrgId));

      const remaining = await db.select({ id: workspaces.id }).from(workspaces)
        .where(and(eq(workspaces.parentWorkspaceId, subOrg.parentWorkspaceId), eq(workspaces.isSubOrg, true)));

      await db.update(workspaces)
        .set({ subOrgAddonCount: remaining.length, updatedAt: new Date() })
        .where(eq(workspaces.id, subOrg.parentWorkspaceId));

      try {
        const { trinityOrgIntelligenceService } = await import('../services/ai-brain/trinityOrgIntelligenceService');
        trinityOrgIntelligenceService.invalidateHierarchyCache(subOrg.parentWorkspaceId);
        trinityOrgIntelligenceService.invalidateHierarchyCache(subOrgId);
      } catch { /* non-critical */ }

      log.info(`[SubOrg] Detached workspace ${subOrgId} from parent ${subOrg.parentWorkspaceId}`);
      res.json({ success: true, message: `${subOrg.name} has been detached and is now an independent organization` });
    } catch (error: unknown) {
      log.error('[SubOrg] Error detaching sub-org:', error);
      res.status(500).json({ message: 'Failed to detach sub-organization' });
    }
  });

  router.post('/sub-orgs/batch-payroll', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { resolveWorkspaceForUser } = await import('../rbac');
      const { workspaceId: currentWsId, role } = await resolveWorkspaceForUser(userId);

      if (!currentWsId) {
        return res.status(400).json({ error: 'No workspace context found' });
      }

      if (!role || !['org_owner', 'co_owner'].includes(role)) {
        return res.status(403).json({ error: 'Only org owners can trigger batch payroll' });
      }

      const parentWs = await storage.getWorkspace(currentWsId);
      if (!parentWs) {
        return res.status(404).json({ error: 'Parent workspace not found' });
      }

      const rootId = parentWs.parentWorkspaceId || currentWsId;
      if (parentWs.isSubOrg) {
        const rootOwner = await storage.getWorkspace(rootId);
        if (!rootOwner || rootOwner.ownerId !== userId) {
          return res.status(403).json({ error: 'Only the root org owner can trigger batch payroll' });
        }
      }

      const subOrgs = await db.select().from(workspaces)
        .where(and(
          eq(workspaces.parentWorkspaceId, rootId),
          eq(workspaces.isSubOrg, true)
        ));

      const allWorkspaceIds = [rootId, ...subOrgs.map(s => s.id)];

      const { payPeriodStart, payPeriodEnd } = req.body || {};
      const { createAutomatedPayrollRun } = await import('../services/payrollAutomation');

      let periodStart: Date;
      let periodEnd: Date;

      if (payPeriodStart && payPeriodEnd) {
        periodStart = new Date(payPeriodStart);
        periodEnd = new Date(payPeriodEnd);
        if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
          return res.status(400).json({ error: 'Invalid date format for payPeriodStart or payPeriodEnd' });
        }
        if (periodStart >= periodEnd) {
          return res.status(400).json({ error: 'payPeriodStart must be before payPeriodEnd' });
        }
      } else {
        const now = new Date();
        periodEnd = new Date(now);
        periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - 14);
      }

      const results: Array<{
        workspaceId: string;
        workspaceName: string;
        success: boolean;
        payrollRunId?: string;
        error?: string;
      }> = [];

      for (const wsId of allWorkspaceIds) {
        const ws = wsId === rootId ? parentWs : subOrgs.find(s => s.id === wsId);
        const wsName = ws?.name || wsId;
        try {
          const payrollRun = await createAutomatedPayrollRun({
            workspaceId: wsId,
            periodStart,
            periodEnd,
            createdBy: userId,
          });
          results.push({
            workspaceId: wsId,
            workspaceName: wsName,
            success: true,
            payrollRunId: (payrollRun as any).id,
          });
        } catch (err: unknown) {
          results.push({
            workspaceId: wsId,
            workspaceName: wsName,
            success: false,
            error: (err instanceof Error ? err.message : String(err)) || 'Unknown error',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      log.info(`[BatchPayroll] Completed for ${allWorkspaceIds.length} orgs: ${successCount} success, ${failureCount} failed`);

      res.json({
        success: true,
        message: `Batch payroll processed for ${allWorkspaceIds.length} organizations`,
        summary: { total: allWorkspaceIds.length, succeeded: successCount, failed: failureCount },
        results,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        triggeredBy: userId,
        billedToParent: rootId,
      });
    } catch (error: unknown) {
      log.error('[BatchPayroll] Error:', error);
      res.status(500).json({ message: 'Failed to run batch payroll' });
    }
  });

  router.post('/sub-orgs/batch-invoices', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { resolveWorkspaceForUser } = await import('../rbac');
      const { workspaceId: currentWsId, role } = await resolveWorkspaceForUser(userId);

      if (!currentWsId) {
        return res.status(400).json({ error: 'No workspace context found' });
      }

      if (!role || !['org_owner', 'co_owner'].includes(role)) {
        return res.status(403).json({ error: 'Only org owners can trigger batch invoicing' });
      }

      const parentWs = await storage.getWorkspace(currentWsId);
      if (!parentWs) {
        return res.status(404).json({ error: 'Parent workspace not found' });
      }

      const rootId = parentWs.parentWorkspaceId || currentWsId;
      if (parentWs.isSubOrg) {
        const rootOwner = await storage.getWorkspace(rootId);
        if (!rootOwner || rootOwner.ownerId !== userId) {
          return res.status(403).json({ error: 'Only the root org owner can trigger batch invoicing' });
        }
      }

      const subOrgs = await db.select().from(workspaces)
        .where(and(
          eq(workspaces.parentWorkspaceId, rootId),
          eq(workspaces.isSubOrg, true)
        ));

      const allWorkspaceIds = [rootId, ...subOrgs.map(s => s.id)];

      const { periodDays } = req.body || {};
      const invoicePeriodDays = typeof periodDays === 'number' && periodDays > 0 && periodDays <= 90 ? periodDays : 7;
      const { generateWeeklyInvoices } = await import('../services/billingAutomation');

      const results: Array<{
        workspaceId: string;
        workspaceName: string;
        success: boolean;
        invoiceCount?: number;
        totalAmount?: string;
        error?: string;
      }> = [];

      const platformFeeParts: string[] = [];

      for (const wsId of allWorkspaceIds) {
        const ws = wsId === rootId ? parentWs : subOrgs.find(s => s.id === wsId);
        const wsName = ws?.name || wsId;
        try {
          const invoiceResult = await generateWeeklyInvoices(wsId, new Date(), invoicePeriodDays);

          const invoiceCount = Array.isArray(invoiceResult) ? invoiceResult.length :
            (invoiceResult as any)?.invoicesGenerated || 0;
          const totalAmountStr = Array.isArray(invoiceResult)
            ? sumFinancialValues(invoiceResult.map((inv: any) => inv.total || '0'))
            : toFinancialString((invoiceResult as any)?.totalInvoiced || '0');

          const feeForOrgStr = applyTax(totalAmountStr, ws?.platformFeePercentage || '3.00');
          platformFeeParts.push(feeForOrgStr);

          results.push({
            workspaceId: wsId,
            workspaceName: wsName,
            success: true,
            invoiceCount,
            totalAmount: totalAmountStr,
          });
        } catch (err: unknown) {
          results.push({
            workspaceId: wsId,
            workspaceName: wsName,
            success: false,
            error: (err instanceof Error ? err.message : String(err)) || 'Unknown error',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      const totalInvoicedStr = sumFinancialValues(results.filter(r => r.totalAmount).map(r => r.totalAmount!));
      const consolidatedPlatformFeesStr = sumFinancialValues(platformFeeParts);

      log.info(`[BatchInvoices] Completed for ${allWorkspaceIds.length} orgs: ${successCount} success, ${failureCount} failed, total $${totalInvoicedStr}`);

      res.json({
        success: true,
        message: `Batch invoicing processed for ${allWorkspaceIds.length} organizations`,
        summary: {
          total: allWorkspaceIds.length,
          succeeded: successCount,
          failed: failureCount,
          totalInvoiced: totalInvoicedStr,
          consolidatedPlatformFees: consolidatedPlatformFeesStr,
        },
        results,
        periodDays: invoicePeriodDays,
        triggeredBy: userId,
        billedToParent: rootId,
      });
    } catch (error: unknown) {
      log.error('[BatchInvoices] Error:', error);
      res.status(500).json({ message: 'Failed to run batch invoicing' });
    }
  });

// ============================================================================
// DATA READINESS — checks all 4 automation pipelines for missing data
// GET /api/workspace/data-readiness
// Returns a structured checklist for org, client, employee, and payroll data
// ============================================================================
router.get('/data-readiness', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { resolveWorkspaceForUser } = await import("../rbac");
    const { workspaceId, error } = await resolveWorkspaceForUser(userId);
    if (error || !workspaceId) return res.status(404).json({ message: error || 'Workspace not found' });

    const ws = await storage.getWorkspace(workspaceId);
    if (!ws) return res.status(404).json({ message: 'Workspace not found' });

    // Fetch counts from DB
    const { db } = await import('../db');
    const { clients, employees } = await import('@shared/schema');
    const { eq, and, count, sql: drizzleSql } = await import('drizzle-orm');

    const [clientRows] = await db
      .select({ total: count(), missing_email: drizzleSql<number>`count(*) filter (where billing_email is null or billing_email = '')`, missing_rate: drizzleSql<number>`count(*) filter (where contract_rate is null or contract_rate = 0)`, missing_address: drizzleSql<number>`count(*) filter (where address is null or address = '')` })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    const [empRows] = await db
      .select({ total: count() })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));

    // Payroll readiness from employee_payroll_info
    // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: employee_payroll_info, employees | Verified: 2026-03-23
    const payrollInfoRows = await typedQuery(drizzleSql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE bank_routing_number IS NULL OR bank_routing_number = '') as missing_bank,
        COUNT(*) FILTER (WHERE w4_completed = false OR w4_completed IS NULL) as missing_w4,
        COUNT(*) FILTER (WHERE i9_completed = false OR i9_completed IS NULL) as missing_i9,
        COUNT(*) FILTER (WHERE direct_deposit_enabled = false OR direct_deposit_enabled IS NULL) as no_direct_deposit
      FROM employee_payroll_info epi
      JOIN employees e ON e.id = epi.employee_id
      WHERE e.workspace_id = ${workspaceId} AND e.status = 'active'
    `);
    const pr = ((payrollInfoRows as any).rows?.[0] || {}) as any;

    // Build readiness report
    const orgChecks = [
      { id: 'ein', label: 'Federal Tax ID (EIN)', ok: !!(ws as any).taxId, critical: true, section: 'org', tip: 'Required for W-2, 941, and payroll tax filings' },
      { id: 'company_name', label: 'Company Name', ok: !!(ws as any).companyName || !!(ws as any).name, critical: true, section: 'org', tip: 'Appears on all invoices, pay stubs, and tax filings' },
      { id: 'address', label: 'Company Address', ok: !!(ws as any).address, critical: true, section: 'org', tip: 'Required for invoice headers and regulatory compliance' },
      { id: 'state_license', label: 'State Regulatory License', ok: !!(ws as any).stateLicenseNumber, critical: true, section: 'org', tip: 'Required for security companies by state law' },
    ];

    const invoiceChecks = [
      { id: 'billing_email', label: 'Invoice From Email', ok: !!(ws as any).billingEmail, critical: true, section: 'invoice', tip: 'The email address used to send invoices to clients' },
      { id: 'invoice_prefix', label: 'Invoice Number Prefix', ok: !!(ws as any).invoicePrefix, critical: false, section: 'invoice', tip: 'Prefix used in invoice numbers (e.g. INV-1000)' },
      { id: 'payment_terms', label: 'Payment Terms', ok: !!((ws as any).paymentTermsDays && (ws as any).paymentTermsDays > 0), critical: false, section: 'invoice', tip: 'Number of days clients have to pay (e.g. Net 30)' },
      { id: 'default_tax_rate', label: 'Default Tax Rate', ok: !!((ws as any).defaultTaxRate !== undefined), critical: false, section: 'invoice', tip: 'Applied to invoices unless overridden per client' },
      { id: 'clients_missing_email', label: `Client Billing Emails (${(clientRows as any).missing_email || 0} missing)`, ok: Number((clientRows as any).missing_email || 0) === 0, critical: true, section: 'invoice', tip: 'Clients without a billing email cannot receive invoices' },
      { id: 'clients_missing_rate', label: `Client Billable Rates (${(clientRows as any).missing_rate || 0} missing)`, ok: Number((clientRows as any).missing_rate || 0) === 0, critical: true, section: 'invoice', tip: 'Clients without a rate cannot be billed' },
    ];

    const payrollChecks = [
      { id: 'payroll_schedule', label: 'Payroll Schedule', ok: !!(ws as any).payrollSchedule, critical: true, section: 'payroll', tip: 'How frequently employees are paid (weekly, biweekly, etc.)' },
      { id: 'default_rate', label: 'Default Hourly Rate', ok: !!((ws as any).defaultHourlyRate && Number((ws as any).defaultHourlyRate) > 0), critical: false, section: 'payroll', tip: 'Fallback rate when employee does not have a defined rate' },
      { id: 'sui_rate', label: 'State Unemployment Rate', ok: !!((ws as any).stateUnemploymentRate !== undefined), critical: false, section: 'payroll', tip: 'Employer SUI rate used for payroll cost reporting' },
      { id: 'payroll_bank', label: 'Payroll Funding Bank', ok: !!(ws as any).payrollBankRouting, critical: false, section: 'payroll', tip: 'Bank account used to fund payroll disbursements' },
      { id: 'employees_missing_bank', label: `Employee Direct Deposit (${Number(pr.missing_bank || 0)} missing)`, ok: Number(pr.missing_bank || 0) === 0, critical: true, section: 'payroll', tip: 'Employees without bank info cannot receive direct deposit' },
      { id: 'employees_missing_w4', label: `Employee W-4 Forms (${Number(pr.missing_w4 || 0)} incomplete)`, ok: Number(pr.missing_w4 || 0) === 0, critical: true, section: 'payroll', tip: 'W-4 required to calculate correct federal withholding' },
      { id: 'employees_missing_i9', label: `Employee I-9 Verification (${Number(pr.missing_i9 || 0)} incomplete)`, ok: Number(pr.missing_i9 || 0) === 0, critical: true, section: 'payroll', tip: 'I-9 required by law to verify employment eligibility' },
    ];

    const allChecks = [...orgChecks, ...invoiceChecks, ...payrollChecks];
    const totalChecks = allChecks.length;
    const passedChecks = allChecks.filter(c => c.ok).length;
    const criticalFailing = allChecks.filter(c => c.critical && !c.ok);
    const overallScore = Math.round((passedChecks / totalChecks) * 100);

    res.json({
      score: overallScore,
      totalChecks,
      passedChecks,
      failedChecks: totalChecks - passedChecks,
      criticalFailingCount: criticalFailing.length,
      automationReady: criticalFailing.length === 0,
      sections: {
        org: { label: 'Organization Data', checks: orgChecks, score: Math.round(orgChecks.filter(c => c.ok).length / orgChecks.length * 100) },
        invoice: { label: 'Invoice Pipeline', checks: invoiceChecks, score: Math.round(invoiceChecks.filter(c => c.ok).length / invoiceChecks.length * 100) },
        payroll: { label: 'Payroll Pipeline', checks: payrollChecks, score: Math.round(payrollChecks.filter(c => c.ok).length / payrollChecks.length * 100) },
      },
      workspace: {
        invoicePrefix: (ws as any).invoicePrefix || 'INV',
        invoiceNextNumber: (ws as any).invoiceNextNumber || 1000,
        paymentTermsDays: (ws as any).paymentTermsDays || 30,
        billingEmail: (ws as any).billingEmail || null,
        stateUnemploymentRate: (ws as any).stateUnemploymentRate || '0.027',
        payrollSchedule: (ws as any).payrollSchedule || 'biweekly',
      },
      counts: {
        totalClients: Number((clientRows as any).total || 0),
        clientsMissingEmail: Number((clientRows as any).missing_email || 0),
        clientsMissingRate: Number((clientRows as any).missing_rate || 0),
        totalActiveEmployees: Number((empRows as any).total || 0),
        employeesMissingBank: Number(pr.missing_bank || 0),
        employeesMissingW4: Number(pr.missing_w4 || 0),
        employeesMissingI9: Number(pr.missing_i9 || 0),
      },
    });
  } catch (error: unknown) {
    log.error('[DataReadiness] Error:', error);
    res.status(500).json({ message: 'Failed to compute data readiness' });
  }
});

// ============================================================================
// STORAGE USAGE — Option B category breakdown for the settings dashboard
// GET /api/workspace/storage-usage
// ============================================================================
router.get('/storage-usage', requireAuth, async (req: any, res) => {
  try {
    const workspaceId: string | undefined =
      req.workspaceId || req.user?.workspaceId || req.session?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'No workspace context' });
    }
    const { getStorageUsage } = await import('../services/storage/storageQuotaService');
    const usage = await getStorageUsage(workspaceId);
    res.json(usage);
  } catch (err: any) {
    log.error('[StorageUsage] GET /storage-usage failed:', err?.message);
    res.status(500).json({ message: 'Failed to retrieve storage usage' });
  }
});

export default router;
