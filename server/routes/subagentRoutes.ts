/**
 * SUBAGENT ORCHESTRATION API ROUTES
 * ==================================
 * API endpoints for managing AI subagents, access control, and support interventions.
 * 
 * RBAC: Most endpoints require sysop or higher platform role.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import {
  aiSubagentDefinitions,
  subagentTelemetry,
  supportInterventions,
  trinityAccessControl,
} from '@shared/schema';
import { subagentSupervisor } from '../services/ai-brain/subagentSupervisor';
import { subagentPerformanceMeetingService, MeetingMode } from '../services/ai-brain/subagentPerformanceMeetingService';
import { aiBrainAuthorizationService, AI_BRAIN_AUTHORITY_ROLES } from '../services/ai-brain/aiBrainAuthorizationService';
import { storage } from '../storage';
import type { AuthenticatedRequest } from '../rbac';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('SubagentRoutes');


const router = Router();

router.use(requireAuth);

// ============================================================================
// VALIDATION SCHEMAS (Security hardening)
// ============================================================================

const subagentUpdateSchema = z.object({
  description: z.string().max(2000).optional(),
  maxRetries: z.number().min(0).max(10).optional(),
  timeoutMs: z.number().min(1000).max(300000).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  requiresApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

const subagentToggleSchema = z.object({
  isActive: z.boolean(),
}).strict();

const accessControlSchema = z.object({
  workspaceId: z.string().min(1).max(100),
  resourceType: z.enum(['page', 'feature', 'tool', 'mascot', 'subagent']),
  resourceId: z.string().min(1).max(200),
  resourceName: z.string().max(200).optional(),
  isEnabled: z.boolean().optional(),
  allowedRoles: z.array(z.string()).optional(),
  deniedRoles: z.array(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  approvalRoles: z.array(z.string()).optional(),
  autoApproveFor: z.array(z.string()).optional(),
  trinityCanAssist: z.boolean().optional(),
  trinityCanAutoFix: z.boolean().optional(),
  aiToolsEnabled: z.boolean().optional(),
  mascotVisible: z.boolean().optional(),
}).strict();

const accessControlUpdateSchema = accessControlSchema.partial().omit({ workspaceId: true, resourceType: true, resourceId: true });

const interventionRejectSchema = z.object({
  reason: z.string().min(1).max(2000),
}).strict();

const executeTestSchema = z.object({
  domain: z.enum(['scheduling', 'payroll', 'invoicing', 'compliance', 'notifications', 'analytics', 'gamification', 'communication', 'health', 'testing', 'deployment', 'recovery', 'orchestration', 'security']),
  actionId: z.string().min(1).max(200),
  parameters: z.record(z.any()).optional(),
  workspaceId: z.string().max(100).optional(),
}).strict();

// ============================================================================
// MIDDLEWARE: Require sysop+ role for subagent management
// ============================================================================

async function requireSubagentAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id || req.session?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const platformRole = await storage.getUserPlatformRole(userId) || 'none';
  
  // Subagent management requires sysop or higher
  const authorizedRoles = ['root_admin', 'deputy_admin', 'sysop'];
  if (!authorizedRoles.includes(platformRole)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Insufficient permissions. Requires sysop or higher role.' 
    });
  }

  req.platformRole = platformRole;
  req.userId = userId;
  next();
}

// ============================================================================
// SUBAGENT REGISTRY ENDPOINTS
// ============================================================================

router.get('/subagents', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const subagents = await subagentSupervisor.getAllSubagents();
    res.json({ success: true, subagents });
  } catch (error: unknown) {
    log.error('[SubagentRoutes] Error fetching subagents:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/subagents/:id', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const subagent = await subagentSupervisor.getSubagent(req.params.id);
    if (!subagent) {
      return res.status(404).json({ success: false, error: 'Subagent not found' });
    }
    res.json({ success: true, subagent });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/subagents/domain/:domain', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const subagents = await subagentSupervisor.getSubagentsByDomain(req.params.domain as any);
    res.json({ success: true, subagents });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.patch('/subagents/:id', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate input - reject unknown fields
    const validation = subagentUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input',
        details: validation.error.errors 
      });
    }
    
    const [updated] = await db.update(aiSubagentDefinitions)
      .set({ ...validation.data, updatedAt: new Date() })
      .where(eq(aiSubagentDefinitions.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Subagent not found' });
    }
    
    res.json({ success: true, subagent: updated });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/subagents/:id/toggle', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate input
    const validation = subagentToggleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input: isActive (boolean) required' 
      });
    }
    
    const [updated] = await db.update(aiSubagentDefinitions)
      .set({ isActive: validation.data.isActive, updatedAt: new Date() })
      .where(eq(aiSubagentDefinitions.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Subagent not found' });
    }
    
    res.json({ success: true, subagent: updated, message: `Subagent ${validation.data.isActive ? 'enabled' : 'disabled'}` });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// SUBAGENT HEALTH & TELEMETRY
// ============================================================================

router.get('/health', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const health = await subagentSupervisor.getSubagentHealth();
    res.json({ success: true, health });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/telemetry', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { subagentId, workspaceId, limit = 50 } = req.query;
    
    let query = db.select().from(subagentTelemetry);
    
    if (subagentId) {
      query = query.where(eq(subagentTelemetry.subagentId, subagentId as string)) as any;
    }
    if (workspaceId) {
      query = query.where(eq(subagentTelemetry.workspaceId, workspaceId as string)) as any;
    }
    
    const telemetry = await query
      .orderBy(desc(subagentTelemetry.createdAt))
      .limit(Math.min(Math.max(1, parseInt(limit as string) || 50), 200));
    
    res.json({ success: true, telemetry });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/telemetry/:executionId', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const [telemetry] = await db.select().from(subagentTelemetry)
      .where(eq(subagentTelemetry.executionId, req.params.executionId));
    
    if (!telemetry) {
      return res.status(404).json({ success: false, error: 'Telemetry not found' });
    }
    
    res.json({ success: true, telemetry });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// SELF-CORRECTION METRICS (Observability for retry loop monitoring)
// ============================================================================

router.get('/metrics/self-correction', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { workspaceId, subagentId, since } = req.query;
    
    const metrics = await subagentSupervisor.getSelfCorrectionMetrics({
      workspaceId: workspaceId as string | undefined,
      subagentId: subagentId as string | undefined,
      since: since ? new Date(since as string) : undefined
    });
    
    res.json({ 
      success: true, 
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    log.error('[SubagentRoutes] Error fetching self-correction metrics:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * GET /api/subagents/metrics/credits
 * Unified credit consumption tracker for AI Brain operations
 * Returns credit usage breakdown by domain, execution metrics, and balance
 */
router.get('/metrics/credits', requireSubagentAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, since } = req.query;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'workspaceId is required' });
    }

    // Import credit manager for unified tracking
    const { creditManager } = await import('../services/billing/creditManager');
    
    // Get credit balance and account info
    const creditsAccount = await creditManager.getCreditsAccount(workspaceId as string);
    
    // Get monthly usage breakdown by feature
    const monthlyBreakdown = await creditManager.getMonthlyUsageBreakdown(workspaceId as string);
    
    // Get recent transaction history
    const recentTransactions = await creditManager.getTransactionHistory(
      workspaceId as string, 
      20,  // Last 20 transactions
      0
    );

    // Get self-correction metrics (which now includes credit tracking)
    const selfCorrectionMetrics = await subagentSupervisor.getSelfCorrectionMetrics({
      workspaceId: workspaceId as string,
      since: since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000)
    });

    // Calculate domain-level credit aggregation with safe key extraction
    const creditsByDomain: Record<string, { credits: number; operations: number }> = {};
    for (const breakdown of monthlyBreakdown) {
      // Safely extract domain from featureKey (handles ai_*, custom keys, and null)
      let domain = 'general';
      if (breakdown.featureKey) {
        domain = breakdown.featureKey.startsWith('ai_') 
          ? breakdown.featureKey.replace('ai_', '') 
          : breakdown.featureKey;
      }
      if (!creditsByDomain[domain]) {
        creditsByDomain[domain] = { credits: 0, operations: 0 };
      }
      creditsByDomain[domain].credits += Number(breakdown.totalCredits) || 0;
      creditsByDomain[domain].operations += Number(breakdown.operationCount) || 0;
    }

    res.json({ 
      success: true, 
      creditMetrics: {
        balance: {
          current: creditsAccount?.currentBalance || 0,
          allocation: creditsAccount?.monthlyAllocation || 0,
          percentUsed: creditsAccount?.monthlyAllocation 
            ? Math.round(((creditsAccount.monthlyAllocation - (creditsAccount?.currentBalance || 0)) / creditsAccount.monthlyAllocation) * 100)
            : 0,
          isSuspended: creditsAccount?.isSuspended || false,
          nextResetAt: creditsAccount?.nextResetAt || null,
        },
        monthlyBreakdown,
        byDomain: creditsByDomain,
        recentTransactions: recentTransactions.slice(0, 10).map(t => ({
          id: t.id,
          type: t.transactionType,
          amount: t.amount,
          feature: t.featureName,
          timestamp: t.createdAt,
        })),
        selfCorrectionMetrics: {
          totalExecutions: selfCorrectionMetrics.totalExecutions,
          retrySuccessRate: selfCorrectionMetrics.retrySuccessRate,
          avgRetriesPerExecution: selfCorrectionMetrics.avgRetriesPerExecution,
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    log.error('[SubagentRoutes] Error fetching credit metrics:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// SUPPORT INTERVENTIONS (Approval Workflow)
// ============================================================================

router.get('/interventions', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { workspaceId, status = 'pending' } = req.query;
    
    let interventions;
    if (status === 'pending') {
      interventions = await subagentSupervisor.getPendingInterventions(workspaceId as string);
    } else {
      const query = db.select().from(supportInterventions)
        .orderBy(desc(supportInterventions.createdAt));
      
      if (workspaceId) {
        interventions = await query.where(eq(supportInterventions.workspaceId, workspaceId as string));
      } else {
        interventions = await query;
      }
    }
    
    res.json({ success: true, interventions });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/interventions/:id', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const [intervention] = await db.select().from(supportInterventions)
      .where(eq(supportInterventions.id, req.params.id));
    
    if (!intervention) {
      return res.status(404).json({ success: false, error: 'Intervention not found' });
    }
    
    res.json({ success: true, intervention });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/interventions/:id/approve', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId || req.userId;
    const platformRole = req.platformRole;
    
    const approved = await subagentSupervisor.approveIntervention(
      req.params.id,
      userId!,
      platformRole
    );
    
    if (!approved) {
      return res.status(400).json({ success: false, error: 'Failed to approve intervention' });
    }
    
    res.json({ success: true, message: 'Intervention approved and fix executed' });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/interventions/:id/reject', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId || req.userId;
    
    // Validate input
    const validation = interventionRejectSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input: reason (string) required' 
      });
    }
    
    const [updated] = await db.update(supportInterventions)
      .set({
        status: 'rejected',
        rejectedBy: userId!,
        rejectedAt: new Date(),
        rejectionReason: validation.data.reason,
        updatedAt: new Date(),
      })
      .where(eq(supportInterventions.id, req.params.id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Intervention not found' });
    }
    
    res.json({ success: true, message: 'Intervention rejected', intervention: updated });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// TRINITY ACCESS CONTROL (Per-workspace/feature RBAC)
// ============================================================================

router.get('/access-control', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { workspaceId, resourceType } = req.query;
    
    let query = db.select().from(trinityAccessControl);
    
    if (workspaceId) {
      query = query.where(eq(trinityAccessControl.workspaceId, workspaceId as string)) as any;
    }
    if (resourceType) {
      query = query.where(eq(trinityAccessControl.resourceType, resourceType as string)) as any;
    }
    
    const controls = await query;
    res.json({ success: true, controls });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/access-control/:workspaceId/:resourceType/:resourceId', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const { workspaceId, resourceType, resourceId } = req.params;
    
    const [control] = await db.select().from(trinityAccessControl)
      .where(and(
        eq(trinityAccessControl.workspaceId, workspaceId),
        eq(trinityAccessControl.resourceType, resourceType),
        eq(trinityAccessControl.resourceId, resourceId)
      ));
    
    if (!control) {
      return res.status(404).json({ success: false, error: 'Access control not found' });
    }
    
    res.json({ success: true, control });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/access-control', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId || req.userId;
    
    // Validate input - reject unknown fields
    const validation = accessControlSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input',
        details: validation.error.errors 
      });
    }
    
    const { workspaceId, resourceType, resourceId, ...settings } = validation.data;
    
    const control = await subagentSupervisor.setAccessControl(
      workspaceId,
      resourceType,
      resourceId,
      settings,
      userId!
    );
    
    res.json({ success: true, control });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.patch('/access-control/:id', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId || req.userId;
    
    // Validate input - reject unknown fields
    const validation = accessControlUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input',
        details: validation.error.errors 
      });
    }
    
    const [updated] = await db.update(trinityAccessControl)
      .set({
        ...validation.data,
        configuredBy: userId!,
        configuredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trinityAccessControl.id, req.params.id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Access control not found' });
    }
    
    res.json({ success: true, control: updated });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.delete('/access-control/:id', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const [deleted] = await db.delete(trinityAccessControl)
      .where(eq(trinityAccessControl.id, req.params.id))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Access control not found' });
    }
    
    res.json({ success: true, message: 'Access control deleted' });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// SUBAGENT EXECUTION (Test/Debug)
// ============================================================================

router.post('/execute', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id || authReq.session?.userId || req.userId;
    const platformRole = req.platformRole;
    
    // Validate input - reject unknown fields
    const validation = executeTestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input',
        details: validation.error.errors 
      });
    }
    
    const { domain, actionId, parameters, workspaceId } = validation.data;
    
    // Simple test handler for debugging
    const testHandler = async (params: Record<string, any>) => {
      return { executed: true, params, timestamp: new Date().toISOString() };
    };
    
    const result = await subagentSupervisor.executeAction(
      domain,
      actionId,
      parameters || {},
      userId!,
      workspaceId || 'test-workspace',
      platformRole,
      testHandler
    );
    
    res.json({ success: result.success, result });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// PERFORMANCE MEETING ENDPOINTS
// ============================================================================

const meetingModeSchema = z.object({
  mode: z.enum(['standard', 'fast', 'emergency']).optional(),
}).strict();

router.post('/performance-meetings/conduct', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = req.workspaceId || authReq.session?.workspaceId || 'platform-system';
    
    const validation = meetingModeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid input',
        details: validation.error.errors 
      });
    }
    
    const mode = (validation.data.mode || 'standard') as MeetingMode;
    const result = await subagentPerformanceMeetingService.triggerManualMeeting(workspaceId, mode);
    
    res.json({ success: true, meeting: result });
  } catch (error: unknown) {
    log.error('[SubagentRoutes] Performance meeting failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/performance-meetings/fast', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = req.workspaceId || authReq.session?.workspaceId || 'platform-system';
    
    const result = await subagentPerformanceMeetingService.triggerFastMeeting(workspaceId);
    
    res.json({ success: true, meeting: result });
  } catch (error: unknown) {
    log.error('[SubagentRoutes] FAST meeting failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/performance-meetings/history', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const meetings = subagentPerformanceMeetingService.getMeetingHistory(limit);
    
    res.json({ success: true, meetings });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/performance-meetings/supervisors/status', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const supervisors = subagentPerformanceMeetingService.getHandlerSupervisors();
    
    res.json({ success: true, supervisors });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/performance-meetings/schedule', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const config = subagentPerformanceMeetingService.getScheduleConfig();
    
    res.json({ success: true, schedule: config });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/performance-meetings/:meetingId', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const meeting = subagentPerformanceMeetingService.getMeeting(req.params.meetingId);
    
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    res.json({ success: true, meeting });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.put('/performance-meetings/schedule', requireSubagentAccess, async (req: Request, res: Response) => {
  try {
    const configSchema = z.object({
      enabled: z.boolean().optional(),
      frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
      dayOfWeek: z.number().min(0).max(6).optional(),
      timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      fastModeThreshold: z.number().min(0).max(100).optional(),
      autoOptimize: z.boolean().optional(),
    }).strict();
    
    const validation = configSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid schedule configuration',
        details: validation.error.errors 
      });
    }
    
    subagentPerformanceMeetingService.updateScheduleConfig(validation.data);
    const config = subagentPerformanceMeetingService.getScheduleConfig();
    
    res.json({ success: true, schedule: config });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// INITIALIZE SUBAGENT SUPERVISOR ON ROUTE LOAD
// ============================================================================

(async () => {
  try {
    await subagentSupervisor.initialize();
    await subagentPerformanceMeetingService.initialize();
    log.info('[SubagentRoutes] Subagent supervisor and performance meeting service initialized');
  } catch (error) {
    log.error('[SubagentRoutes] Failed to initialize subagent services:', error);
  }
})();

export default router;
