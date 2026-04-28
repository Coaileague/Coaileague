/**
 * TRINITY STAFFING API ROUTES
 * ============================
 * API endpoints for Trinity Staffing Premier automation feature.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import crypto from 'crypto';
import type { AuthenticatedRequest } from '../rbac';
import { trinityStaffingOrchestrator } from '../services/trinityStaffing/orchestrator';
import { escalationChainService } from '../services/trinityStaffing/escalationChainService';
import { workRequestParser } from '../services/trinityStaffing/workRequestParser';
import { premiumFeatureGating } from '../services/premiumFeatureGating';
import { requireAuth } from '../auth';
import { requireProfessional } from '../tierGuards';
import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('TrinityStaffingRoutes');


/** Persist staffing webhook config to workspaces.automation_policy_blob for restart-survival */
async function persistWebhookConfig(workspaceId: string, token: string, secret: string | undefined, systemUserId?: string): Promise<void> {
  const payload = { staffingWebhookToken: token, staffingWebhookSecret: secret || null, staffingWebhookSystemUserId: systemUserId || null, staffingWebhookCreatedAt: new Date().toISOString() };
  // CATEGORY C — Raw SQL retained: JSONB merge via || operator not expressible in Drizzle ORM | Tables: workspaces | Verified: 2026-03-23
  await (db as any).$client.query(
    `UPDATE workspaces SET automation_policy_blob = COALESCE(automation_policy_blob, '{}') || $1::jsonb WHERE id = $2`,
    [JSON.stringify(payload), workspaceId]
  ).catch ((err: unknown) => {
    log.warn('[TrinityStaffing] Failed to persist webhook config to DB (in-memory fallback active):', err instanceof Error ? err.message : String(err));
  });
}

/** Restore webhook config from DB into in-memory map (called on cache miss) */
async function restoreWebhookConfigFromDb(token: string): Promise<boolean> {
  try {
    const [ws] = await db.select({ id: workspaces.id, blob: workspaces.automationPolicyBlob }).from(workspaces)
      .where(eq((workspaces as any).automationPolicyBlob['staffingWebhookToken'], token))
      .limit(1).catch(() => []);
    if (!ws) {
      // Fallback: scan all workspaces for a matching token in their blob
      const all = await db.select({ id: workspaces.id, blob: workspaces.automationPolicyBlob }).from(workspaces).limit(500);
      for (const row of all) {
        const blob = row.blob as Record<string, any> || {};
        if (blob.staffingWebhookToken === token) {
          trinityStaffingOrchestrator.registerWebhookToken(row.id, token, blob.staffingWebhookSecret || undefined, blob.staffingWebhookSystemUserId || undefined);
          return true;
        }
      }
      return false;
    }
    const blob = ws.blob as Record<string, any> || {};
    trinityStaffingOrchestrator.registerWebhookToken(ws.id, token, blob.staffingWebhookSecret || undefined, blob.staffingWebhookSystemUserId || undefined);
    return true;
  } catch {
    return false;
  }
}

const router = Router();

router.use(requireAuth);

function hasManagerAccess(role: string | null | undefined): boolean {
  const managerRoles = ['org_owner', 'department_manager', 'co_owner'];
  return !!role && managerRoles.includes(role);
}

/**
 * GET /api/trinity-staffing/status
 * Get Trinity Staffing status for workspace
 */
router.get('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }
    
    const accessResult = await premiumFeatureGating.checkAccess(
      workspaceId,
      'trinity_staffing',
      req.user?.id
    );
    
    const status = trinityStaffingOrchestrator.getStatus(workspaceId);
    
    res.json({
      success: true,
      featureAvailable: accessResult.allowed,
      requiresUpgrade: accessResult.requiresUpgrade,
      suggestedTier: accessResult.suggestedTier,
      ...status,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Status error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity-staffing/settings
 * Get Trinity Staffing settings for workspace
 */
router.get('/settings', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }
    
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    const settings = trinityStaffingOrchestrator.getSettings(workspaceId);
    const escalationTiers = escalationChainService.getEscalationTiers();
    
    res.json({
      success: true,
      settings,
      escalationTiers,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Settings error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * PUT /api/trinity-staffing/settings
 * Update Trinity Staffing settings for workspace
 */
router.put('/settings', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }
    
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    const settings = trinityStaffingOrchestrator.updateSettings(workspaceId, req.body);
    
    res.json({
      success: true,
      settings,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Update settings error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity-staffing/workflows
 * Get active workflows for workspace
 */
router.get('/workflows', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }
    
    const workflows = trinityStaffingOrchestrator.getWorkflowsByWorkspace(workspaceId);
    
    res.json({
      success: true,
      workflows,
      count: workflows.length,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Workflows error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity-staffing/workflows/:id
 * Get specific workflow details
 */
router.get('/workflows/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const workflow = trinityStaffingOrchestrator.getWorkflow(req.params.id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (workflow.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      success: true,
      workflow,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Workflow detail error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity-staffing/workflows/:id/cancel
 * Cancel a workflow
 */
router.post('/workflows/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const workflow = trinityStaffingOrchestrator.getWorkflow(req.params.id);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (workflow.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await trinityStaffingOrchestrator.cancelWorkflow(
      req.params.id,
      req.body.reason || 'Cancelled by user'
    );
    
    res.json({
      success: true,
      message: 'Workflow cancelled',
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Cancel workflow error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity-staffing/test-parse
 * Test email parsing (for configuration/testing)
 */
router.post('/test-parse', async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    const { subject, body, from } = req.body;
    
    const classification = await workRequestParser.classifyEmail(subject, body, from);
    
    let parsedRequest = null;
    if (classification.isWorkRequest) {
      parsedRequest = await workRequestParser.parseWorkRequest(subject, body, from);
    }
    
    res.json({
      success: true,
      classification,
      parsedRequest,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Test parse error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity-staffing/escalation-tiers
 * Get escalation tier configuration
 */
router.get('/escalation-tiers', async (req: AuthenticatedRequest, res) => {
  try {
    const tiers = escalationChainService.getEscalationTiers();
    
    res.json({
      success: true,
      tiers,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Escalation tiers error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity-staffing/inbound-email
 * Authenticated endpoint for processing inbound emails (internal use)
 * Phase 30: Requires Professional tier — inbound email routing is a Professional feature.
 */
router.post('/inbound-email', requireAuth, requireProfessional, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace and user required' });
    }
    
    const { emailId, from, subject, body, receivedAt } = req.body;
    
    const workflow = await trinityStaffingOrchestrator.processInboundEmail(
      workspaceId,
      userId,
      {
        id: emailId || `EMAIL-${crypto.randomUUID()}`,
        from,
        subject,
        body,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      }
    );
    
    res.json({
      success: true,
      workflow,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Inbound email error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity-staffing/webhook-token
 * Generate a webhook token for external email providers
 */
router.post('/webhook-token', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace and user required' });
    }
    
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    const existingConfig = trinityStaffingOrchestrator.getWebhookConfigForWorkspace(workspaceId);
    if (existingConfig) {
      trinityStaffingOrchestrator.revokeWebhookToken(existingConfig.webhookToken);
    }
    
    const config = trinityStaffingOrchestrator.generateWebhookToken(workspaceId, userId);

    // Persist to DB so token survives server restarts
    persistWebhookConfig(workspaceId, config.webhookToken, config.webhookSecret, userId).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    
    res.json({
      success: true,
      webhookToken: config.webhookToken,
      webhookSecret: config.webhookSecret,
      webhookUrl: `/api/public/trinity-staffing/webhook?token=${config.webhookToken}`,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Generate webhook token error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity-staffing/webhook-token
 * Get current webhook token configuration
 */
router.get('/webhook-token', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    const config = trinityStaffingOrchestrator.getWebhookConfigForWorkspace(workspaceId);
    
    if (!config) {
      return res.json({
        success: true,
        configured: false,
      });
    }
    
    res.json({
      success: true,
      configured: true,
      webhookToken: config.webhookToken,
      webhookUrl: `/api/public/trinity-staffing/webhook?token=${config.webhookToken}`,
      createdAt: config.createdAt,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Get webhook token error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * DELETE /api/trinity-staffing/webhook-token
 * Revoke webhook token
 */
router.delete('/webhook-token', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    const config = trinityStaffingOrchestrator.getWebhookConfigForWorkspace(workspaceId);
    
    if (config) {
      trinityStaffingOrchestrator.revokeWebhookToken(config.webhookToken);
    }
    
    res.json({
      success: true,
      message: 'Webhook token revoked',
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Revoke webhook token error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;

/**
 * PUBLIC WEBHOOK ROUTER
 * ======================
 * Separate router for unauthenticated webhook endpoints.
 * Used by external email providers (Resend, SendGrid, etc.)
 */
export const publicWebhookRouter = Router();

/**
 * Validate webhook signature from email provider
 */
function validateWebhookSignature(
  signature: string | undefined,
  payload: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /api/public/trinity-staffing/webhook
 * Public webhook endpoint for email providers
 * Requires webhook token in query string or header for workspace identification
 * 
 * Security notes:
 * - Token authentication required for all requests
 * - Signature validation enforced when webhookSecret is configured
 * - Uses JSON payload signature (configure email providers accordingly)
 * - Tokens are stored in-memory (ephemeral) - for production, persist to database
 */
publicWebhookRouter.post('/webhook', async (req, res) => {
  try {
    // Prefer x-webhook-token header to keep credentials out of server access logs.
    // Query-param ?token= is retained for backward compatibility with existing registered URLs.
    const webhookToken = (req.headers['x-webhook-token'] as string) || (req.query.token as string);
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!webhookToken) {
      log.warn('[TrinityStaffing] Webhook rejected: No token provided');
      return res.status(401).json({ error: 'Webhook token required' });
    }
    
    let workspaceConfig = trinityStaffingOrchestrator.getWorkspaceByWebhookToken(webhookToken);

    // Cache miss: try to restore from DB (token survived server restart in automationPolicyBlob)
    if (!workspaceConfig) {
      const restored = await restoreWebhookConfigFromDb(webhookToken);
      if (restored) {
        workspaceConfig = trinityStaffingOrchestrator.getWorkspaceByWebhookToken(webhookToken);
      }
    }
    
    if (!workspaceConfig) {
      log.warn('[TrinityStaffing] Webhook rejected: Invalid token');
      return res.status(401).json({ error: 'Invalid webhook token' });
    }
    
    if (workspaceConfig.webhookSecret) {
      if (!signature) {
        log.warn('[TrinityStaffing] Webhook rejected: Signature required but missing');
        return res.status(401).json({ error: 'Signature required' });
      }
      
      const isValid = validateWebhookSignature(
        signature,
        JSON.stringify(req.body),
        workspaceConfig.webhookSecret
      );
      if (!isValid) {
        log.warn('[TrinityStaffing] Webhook rejected: Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
    
    const { emailId, from, subject, body, receivedAt, to } = req.body;
    
    const workflow = await trinityStaffingOrchestrator.processInboundEmail(
      workspaceConfig.workspaceId,
      workspaceConfig.systemUserId || 'system',
      {
        id: emailId || `WEBHOOK-${crypto.randomUUID()}`,
        from,
        subject,
        body,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      }
    );
    
    log.info(`[TrinityStaffing] Webhook processed for workspace ${workspaceConfig.workspaceId}`);
    
    res.json({
      success: true,
      workflowId: workflow.id,
      status: workflow.status,
    });
  } catch (error: unknown) {
    log.error('[TrinityStaffing] Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
