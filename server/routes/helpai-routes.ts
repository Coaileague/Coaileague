/**
 * HelpAI Routes - Phases 2-5
 * API orchestration endpoints for registry, integrations, and audit logging
 */

import { sanitizeError } from '../middleware/errorHandler';
import express, { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../auth';
import { type AuthenticatedRequest } from '../rbac';
import { helpaiRegistryService } from '../services/helpai/helpaiRegistryService';
import { helpaiIntegrationService } from '../services/helpai/helpaiIntegrationService';
import { helpaiAuditService } from '../services/helpai/helpaiAuditService';
import { helpAIOrchestrator } from '../services/helpai/helpAIOrchestrator';
import { helposService } from '../services/helposService';
import { storage } from '../storage';
import { PERMISSIONS, ROLES, ROLE_HIERARCHY } from '@shared/platformConfig';
import { AI } from '../config/platformConfig';
import { z } from 'zod';
import { eq, and, desc, asc, gte, lte, count } from 'drizzle-orm';
import { db } from '../db';
import { helpaiSessions, helpaiActionLog, helpaiConversations, helpaiSlaLog, helpaiProactiveAlerts, helpaiFaqGaps, trinityHelpaiCommandBus as trinityHelpaiCommandBusTable } from '@shared/schema';
import { auditLogs } from '@shared/schema/domains/audit';

// Phase 83: Log prompt injection detection events to security audit log (async, non-blocking)
function logInjectionAttempt(opts: { workspaceId?: string; userId?: string; ipAddress?: string; original: string; sanitized: string }): void {
  if (opts.original === opts.sanitized) return; // No injection detected
  db.insert(auditLogs).values({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    action: 'security_prompt_injection_detected',
    rawAction: 'SECURITY_ALERT',
    actionDescription: 'Prompt injection attempt detected and neutralised. Input contained patterns matching injection signatures. Filtered content replaced with [FILTERED].',
    entityType: 'helpai_chat',
    entityId: opts.workspaceId,
    ipAddress: opts.ipAddress,
    isSensitiveData: true,
    complianceTag: 'security_incident',
    metadata: { injectionPatternFound: true, severity: 'high', outcome: 'blocked', originalLength: opts.original.length, sanitisedLength: opts.sanitized.length },
  }).catch(() => {
    /* non-fatal: do not block the request */
  });
}

import { runHelpAIV2Migration } from '../services/helpai/helpAIMigration';
import { getUserPlatformRole } from '../rbac';

// Run v2 table migration on startup (idempotent, non-blocking)
runHelpAIV2Migration().catch(err => log.error('[HelpAI Routes] Migration error:', err));

export const helpaiRouter: Router = express.Router();

/**
 * Middleware: Verify user has access to HelpAI features
 */
const requireHelpAIAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check role hierarchy - must be at least ADMIN level
  const userHierarchy = ROLE_HIERARCHY[user.role as keyof typeof ROLE_HIERARCHY] || 0;
  const adminHierarchy = ROLE_HIERARCHY[ROLES.ADMIN];

  if (userHierarchy < adminHierarchy) {
    return res.status(403).json({
      error: 'Insufficient permissions for HelpAI features',
      required: ROLES.ADMIN,
      current: user.role,
    });
  }

  next();
};

/**
 * GET /api/helpai/registry
 * Get all available APIs in the registry
 * Optional filters: category, tag, active
 */
helpaiRouter.get(
  '/registry',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { category, tag, active } = req.query;

      let apis: any;

      if (category) {
        apis = await helpaiRegistryService.getAPIsByCategory(category as string);
      } else if (tag) {
        apis = await helpaiRegistryService.getAPIsByTag(tag as string);
      } else {
        apis = await helpaiRegistryService.getAllActiveAPIs();
      }

      // Log audit
      await helpaiAuditService.logAuditEvent({
        workspaceId: req.user?.currentWorkspaceId || 'unknown',
        userId: req.user?.id,
        action: 'api_call',
        apiName: 'REGISTRY_QUERY',
        status: 'success',
        requestPayload: {
          category,
          tag,
          active,
        },
        durationMs: 0,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.user?.id || 'unknown',
      });

      res.json({
        success: true,
        count: apis.length,
        apis,
      });
    } catch (error: unknown) {
      log.error('[HelpAI] Registry error:', error);

      await helpaiAuditService.logAuditEvent({
        workspaceId: req.user?.currentWorkspaceId || 'unknown',
        userId: req.user?.id,
        action: 'api_call',
        apiName: 'REGISTRY_QUERY',
        status: 'error',
        responseMessage: sanitizeError(error),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.user?.id || 'unknown',
      });

      res.status(500).json({
        error: 'Failed to retrieve registry',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * GET /api/helpai/registry/:apiName
 * Get a specific API by name
 */
helpaiRouter.get(
  '/registry/:apiName',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { apiName } = req.params;

      const api = await helpaiRegistryService.getAPIByName(apiName);
      if (!api) {
        return res.status(404).json({ error: 'API not found' });
      }

      res.json({
        success: true,
        api,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to retrieve API',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * POST /api/helpai/integrations/config
 * Enable/configure an integration for the workspace
 */
helpaiRouter.post(
  '/integrations/config',
  requireAuth,
  requireHelpAIAccess,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const startTime = Date.now();
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      const userId = req.user?.id;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace required' });
      }

      const { registryId, isEnabled, customEndpoint, customConfig, autoSyncEnabled, syncIntervalMinutes } =
        req.body;

      // Validate required fields
      if (!registryId) {
        return res.status(400).json({ error: 'registryId is required' });
      }

      // Enable/configure the integration
      const integration = await helpaiIntegrationService.enableIntegration(
        {
          registryId,
          workspaceId,
          isEnabled: isEnabled !== false,
          customEndpoint,
          customConfig,
          autoSyncEnabled: autoSyncEnabled || false,
          syncIntervalMinutes: syncIntervalMinutes || 60,
        },
        userId!
      );

      const durationMs = Date.now() - startTime;

      // Log audit
      await helpaiAuditService.logAuditEvent({
        workspaceId,
        userId,
        integrationId: integration.id,
        action: 'integration_enable',
        status: 'success',
        requestPayload: {
          registryId,
          isEnabled,
          customEndpoint,
          autoSyncEnabled,
        },
        durationMs,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: userId || 'unknown',
      });

      res.json({
        success: true,
        integration,
        durationMs,
      });
    } catch (error: unknown) {
      log.error('[HelpAI] Integration config error:', error);

      await helpaiAuditService.logAuditEvent({
        workspaceId: req.user?.currentWorkspaceId || 'unknown',
        userId: req.user?.id,
        action: 'integration_enable',
        status: 'error',
        responseMessage: sanitizeError(error),
        requestPayload: req.body,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.user?.id || 'unknown',
      });

      res.status(500).json({
        error: 'Failed to configure integration',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * GET /api/helpai/integrations
 * Get all integrations for the workspace
 */
helpaiRouter.get(
  '/integrations',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace required' });
      }

      const integrations = await helpaiIntegrationService.getWorkspaceIntegrations(
        workspaceId
      );

      res.json({
        success: true,
        count: integrations.length,
        integrations,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to retrieve integrations',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * GET /api/helpai/audit-log
 * Get audit logs for the workspace
 * Supports filters: action, status, limit, offset
 */
helpaiRouter.get(
  '/audit-log',
  requireAuth,
  requireHelpAIAccess,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace required' });
      }

      const {
        action,
        status,
        limit = '100',
        offset = '0',
      } = req.query;

      const logs = await helpaiAuditService.getWorkspaceAuditLogs(
        workspaceId,
        {
          limit: Math.min(parseInt(limit as string) || 100, 1000),
          offset: parseInt(offset as string) || 0,
          action: action as string | undefined,
          status: status as 'success' | 'error' | 'pending' | undefined,
        }
      );

      // Get stats too
      const stats = await helpaiAuditService.getAuditStats(workspaceId);

      res.json({
        success: true,
        count: logs.length,
        stats,
        logs,
      });
    } catch (error: unknown) {
      log.error('[HelpAI] Audit log error:', error);
      res.status(500).json({
        error: 'Failed to retrieve audit logs',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * GET /api/helpai/audit-log/export
 * Export audit logs as CSV
 */
helpaiRouter.get(
  '/audit-log/export',
  requireAuth,
  requireHelpAIAccess,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace required' });
      }

      const { action } = req.query;

      const csv = await helpaiAuditService.exportAuditLogsAsCSV(
        workspaceId,
        {
          action: action as string | undefined,
        }
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=helpai-audit-log.csv'
      );
      res.send(csv);
    } catch (error: unknown) {
      log.error('[HelpAI] Audit export error:', error);
      res.status(500).json({
        error: 'Failed to export audit logs',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * GET /api/helpai/stats
 * Get HelpAI system statistics
 */
helpaiRouter.get(
  '/stats',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const registryStats = await helpaiRegistryService.getRegistryStats();
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      let auditStats = null;

      if (workspaceId) {
        auditStats = await helpaiAuditService.getAuditStats(workspaceId);
      }

      res.json({
        success: true,
        registry: registryStats,
        audit: auditStats,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to retrieve statistics',
        message: sanitizeError(error),
      });
    }
  }
);

/**
 * POST /api/helpai/audit-log/verify/:logId
 * Verify audit log integrity (SHA-256 hash)
 */
helpaiRouter.post(
  '/audit-log/verify/:logId',
  requireAuth,
  requireHelpAIAccess,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { logId } = req.params;

      const isValid = await helpaiAuditService.verifyActionIntegrity(logId);

      res.json({
        success: true,
        logId,
        isIntegrityValid: isValid,
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to verify audit log integrity',
        message: sanitizeError(error),
      });
    }
  }
);

// ============================================================================
// HELPAI ACTION ORCHESTRATOR ROUTES
// Universal action handler that routes all actions through AI Brain
// ============================================================================

import { helpaiOrchestrator, type ActionRequest } from '../services/helpai/platformActionHub';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('HelpaiRoutes');

// ── Phase 48: Prompt Injection Sanitization ──────────────────────────────────
// Strips well-known prompt injection patterns before user input enters the AI
// context.  This is a defence-in-depth measure — the model's system prompt and
// workspace isolation are the primary controls; this layer normalises raw input
// so injected instructions are clearly inert text.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /you\s+are\s+now\s+(a\s+)?(?!CoAIleague|Trinity)/gi,
  /act\s+as\s+(a\s+)?(?!CoAIleague|Trinity)(?:different|new|unrestricted|uncensored|evil|jailbreak)/gi,
  /forget\s+(all\s+)?(previous|prior|your)\s+(instructions?|context|training)/gi,
  /\bDAN\b/g,
  /jailbreak/gi,
  /prompt\s*injection/gi,
  /system\s*prompt/gi,
];

/**
 * Sanitize user-supplied text before it enters any AI context.
 *
 * - Truncates to 4 000 characters (prevents token-stuffing attacks)
 * - Strips null bytes
 * - Neutralises prompt-injection patterns by wrapping them in [FILTERED]
 */
export function sanitizeUserInputForAI(input: string): string {
  if (typeof input !== 'string') return '';
  // Truncate to prevent token-stuffing / context-window exhaustion attacks
  let safe = input.slice(0, 4_000);
  // Remove null bytes (can confuse some tokenisers)
  safe = safe.replace(/\0/g, '');
  // Neutralise known injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    safe = safe.replace(pattern, '[FILTERED]');
  }
  return safe;
}

/**
 * GET /api/helpai/orchestrator/actions
 * Get all available actions for the current user's role
 */
helpaiRouter.get(
  '/orchestrator/actions',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userRole = req.user?.role || 'employee';
      const actions = helpaiOrchestrator.getAvailableActions(userRole);

      res.json({
        success: true,
        count: actions.length,
        actions: actions.map(a => ({
          actionId: a.actionId,
          name: a.name,
          category: a.category,
          description: a.description,
          isTestTool: a.isTestTool || false
        }))
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to get available actions',
        message: sanitizeError(error)
      });
    }
  }
);

/**
 * GET /api/helpai/orchestrator/test-tools
 * Get all test tools available for support users
 */
helpaiRouter.get(
  '/orchestrator/test-tools',
  requireAuth,
  requireHelpAIAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const testTools = helpaiOrchestrator.getTestTools();

      res.json({
        success: true,
        count: testTools.length,
        tools: testTools.map(t => ({
          actionId: t.actionId,
          name: t.name,
          category: t.category,
          description: t.description
        }))
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to get test tools',
        message: sanitizeError(error)
      });
    }
  }
);

/**
 * POST /api/helpai/orchestrator/execute
 * Execute an action through the AI Brain orchestrator
 */
helpaiRouter.post(
  '/orchestrator/execute',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { actionId, payload, priority, isTestMode } = req.body;

      if (!actionId) {
        return res.status(400).json({ error: 'actionId is required' });
      }

      const request: ActionRequest = {
        actionId,
        category: 'system',
        name: actionId,
        payload,
        workspaceId: req.user?.currentWorkspaceId,
        userId: req.user?.id || 'unknown',
        userRole: req.user?.role || 'employee',
        platformRole: req.platformRole || req.user?.platformRole,
        priority: priority || 'normal',
        isTestMode: isTestMode || false
      };

      const result = await helpaiOrchestrator.executeAction(request);

      res.json({
        success: result.success,
        actionId: result.actionId,
        message: result.message,
        data: result.data,
        executionTimeMs: result.executionTimeMs,
        notificationSent: result.notificationSent,
        broadcastSent: result.broadcastSent
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to execute action',
        message: sanitizeError(error)
      });
    }
  }
);

/**
 * GET /api/helpai/orchestrator/health
 * Get health status of all monitored services
 */
helpaiRouter.get(
  '/orchestrator/health',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const healthStatus = await helpaiOrchestrator.getAllServiceHealth();

      const allHealthy = healthStatus.every(s => s.isHealthy);

      res.json({
        success: true,
        status: allHealthy ? 'healthy' : 'degraded',
        services: healthStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to get health status',
        message: sanitizeError(error)
      });
    }
  }
);

/**
 * POST /api/helpai/orchestrator/command
 * Process a natural language command through the AI Brain
 * This is the main entry point for the Support Command Console
 */
helpaiRouter.post(
  '/orchestrator/command',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { command, context } = req.body;

      if (!command) {
        return res.status(400).json({ error: 'command is required' });
      }

      // Parse the command to determine action
      let actionId = 'ai.query';
      let payload: Record<string, any> = { query: command, context };

      // Check for special command prefixes
      if (command.startsWith('/health')) {
        actionId = 'system.health_check';
        payload = {};
      } else if (command.startsWith('/test-notification')) {
        actionId = 'test.send_notification';
        const parts = command.replace('/test-notification', '').trim();
        payload = { message: parts || 'Test notification' };
      } else if (command.startsWith('/test-alert')) {
        actionId = 'test.send_maintenance_alert';
        const parts = command.replace('/test-alert', '').trim();
        payload = { message: parts || 'Test maintenance alert' };
      } else if (command.startsWith('/broadcast')) {
        actionId = 'support.broadcast';
        const parts = command.replace('/broadcast', '').trim();
        payload = { message: parts };
      } else if (command.startsWith('/push-update')) {
        actionId = 'system.push_update';
        const parts = command.replace('/push-update', '').trim();
        payload = { title: 'Platform Update', description: parts };
      }

      const request: ActionRequest = {
        actionId,
        category: 'support',
        name: 'Command Console',
        payload,
        workspaceId: req.user?.currentWorkspaceId,
        userId: req.user?.id || 'unknown',
        userRole: req.user?.role || 'employee',
        platformRole: req.platformRole || req.user?.platformRole
      };

      const result = await helpaiOrchestrator.executeAction(request);

      res.json({
        success: result.success,
        command,
        actionId: result.actionId,
        response: result.message,
        data: result.data,
        executionTimeMs: result.executionTimeMs
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Failed to process command',
        message: sanitizeError(error)
      });
    }
  }
);

/**
 * POST /api/helpai/chat
 * Trinity Dialogue chat endpoint - routes to HelpOS for AI responses
 * Supports both authenticated and anonymous users
 */
helpaiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { message, workspaceId: reqWorkspaceId, source, mode, conversationHistory = [] } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Phase 48: sanitize user input before it enters AI context
    const safeMessage = sanitizeUserInputForAI(message);
    // Phase 83: log any injection attempts to the security audit log (non-blocking)
    logInjectionAttempt({ workspaceId: reqWorkspaceId, userId: (req as AuthenticatedRequest).session?.userId, ipAddress: req.ip, original: message, sanitized: safeMessage });

    // Support both auth systems
    let userId: string | null = null;
    let userName = 'User';
    let workspaceId = reqWorkspaceId || PLATFORM_WORKSPACE_ID;
    
    // Try custom auth first (session-based)
    if (authReq.session?.userId) {
      userId = authReq.session.userId;
      userName = authReq.session.userName || 'User';
      workspaceId = authReq.session.workspaceId || workspaceId;
    }
    // Try Replit Auth (OIDC)
    else if (authReq.isAuthenticated?.() && authReq.user?.id) {
      userId = authReq.user.id;
      userName = authReq.user?.email || 'User';
    }
    
    // For anonymous users, derive a stable userId
    if (!userId) {
      userId = `anon-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    }

    // Use HelpOS service to get AI response
    const response = await helposService.bubbleAgent_reply({
      workspaceId,
      userId,
      userName,
      userMessage: safeMessage,
      conversationHistory,
      storage
    });

    // Return response in format expected by Trinity Dialogue
    res.json({
      success: true,
      reply: response.message,
      message: response.message,
      sessionId: response.sessionId,
      shouldEscalate: response.shouldEscalate,
      escalationReason: response.escalationReason,
      mode: mode || 'pro',
      source: source || 'trinity-dialogue',
      confidenceScore: AI.defaultConfidenceScore
    });
  } catch (error: unknown) {
    log.error('[HelpAI] Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      message: sanitizeError(error) || 'Internal server error'
    });
  }
});

// ============================================================================
// HELPAI ORCHESTRATOR ROUTES - Full helpdesk lifecycle
// ============================================================================

/**
 * POST /api/helpai/session/start
 * Start a new HelpAI support session (queues user, creates ticket number)
 * Available to all authenticated users AND guests (no requireAuth)
 */
helpaiRouter.post('/session/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const { guestName, guestEmail } = req.body;

    const result = await helpAIOrchestrator.startSession({
      userId: user?.id,
      workspaceId: user?.currentWorkspaceId,
      guestName: guestName || user?.firstName,
      guestEmail: guestEmail || user?.email,
      ipAddress: req.ip,
    });

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    log.error('[HelpAI Orchestrator] Session start error:', error);
    res.status(500).json({ error: 'Failed to start session', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/session/:id/message
 * Process a message in an active HelpAI session
 */
helpaiRouter.post('/session/:id/message', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const user = req.user;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Phase 48: sanitize before AI context
    const safeSessionMessage = sanitizeUserInputForAI(message);
    // Phase 83: log any injection attempts to the security audit log (non-blocking)
    logInjectionAttempt({ workspaceId: user?.currentWorkspaceId, userId: user?.id, ipAddress: req.ip, original: message, sanitized: safeSessionMessage });
    const result = await helpAIOrchestrator.processMessage({
      sessionId: id,
      message: safeSessionMessage,
      userId: user?.id,
      workspaceId: user?.currentWorkspaceId,
    });

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    log.error('[HelpAI Orchestrator] Message error:', error);
    res.status(500).json({ error: 'Failed to process message', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/session/:id/close
 * Force close a session (agents/admins)
 */
helpaiRouter.post('/session/:id/close', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;
    const user = req.user;

    const result = await helpAIOrchestrator.closeSession(id, resolution, user.id);
    res.json({ success: result.success });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to close session', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/session/:id/escalate
 * Manually escalate a session to a real agent
 */
helpaiRouter.post('/session/:id/escalate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await helpAIOrchestrator.processMessage({
      sessionId: id,
      message: `/escalate ${reason || 'manual escalation'}`,
      userId: req.user?.id,
      workspaceId: req.user?.currentWorkspaceId,
    });

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to escalate session', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/safety-code/generate
 * Generate a 6-char safety code for the logged-in user (for helpdesk identity verification)
 */
helpaiRouter.post('/safety-code/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const { purpose, sessionId } = req.body;

    const result = await helpAIOrchestrator.generateSafetyCode(
      user.id,
      user.currentWorkspaceId,
      purpose || 'helpdesk_auth',
      sessionId
    );

    res.json({ success: true, code: result.code, expiresAt: result.expiresAt });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to generate safety code', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/safety-code/verify
 * Verify a safety code in a session
 */
helpaiRouter.post('/safety-code/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId, code } = req.body;
    if (!sessionId || !code) {
      return res.status(400).json({ error: 'sessionId and code are required' });
    }

    const result = await helpAIOrchestrator.verifySafetyCode(sessionId, code, req.ip);
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to verify code', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/bot/summon
 * Summon a system bot with instructions (agents/admins)
 */
helpaiRouter.post('/bot/summon', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const { sessionId, botName, command, instructions } = req.body;

    if (!botName || !instructions) {
      return res.status(400).json({ error: 'botName and instructions are required' });
    }

    const result = await helpAIOrchestrator.summonBot({
      sessionId: sessionId || 'system',
      botName,
      command: command || '/summon',
      instructions,
      workspaceId: user.currentWorkspaceId,
      userId: user.id,
    });

    res.json({ success: result.success, message: result.message });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to summon bot', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/session/:id/rate
 * Submit a satisfaction rating (1-5) for a session
 */
helpaiRouter.post('/session/:id/rate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be a number 1-5' });
    }
    const message = comment ? `${rating} ${comment}` : String(rating);
    const result = await helpAIOrchestrator.processMessage({
      sessionId: id,
      message,
      userId: req.user?.id,
      workspaceId: req.user?.currentWorkspaceId,
    });
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to submit rating', message: sanitizeError(error) });
  }
});

/**
 * POST /api/helpai/session/:id/disconnect
 * User-initiated graceful disconnect (closes session cleanly)
 */
helpaiRouter.post('/session/:id/disconnect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await helpAIOrchestrator.closeSession(id, reason || 'User disconnected', req.user?.id);
    res.json({ success: result.success, message: 'Session closed' });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to disconnect session', message: sanitizeError(error) });
  }
});

/**
 * GET /api/helpai/queue
 * Get current queue status (public endpoint for helpdesk widget)
 */
helpaiRouter.get('/queue', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const queue = helpAIOrchestrator.getCurrentQueue();
    res.json({
      success: true,
      queueSize: queue.length,
      estimatedWaitMinutes: Math.max(1, queue.length * 2),
      entries: queue.map(e => ({ ticketNumber: e.ticketNumber, position: e.position, joinedAt: e.joinedAt })),
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get queue', message: sanitizeError(error) });
  }
});

/**
 * GET /api/helpai/admin/sessions
 * Admin: Get all HelpAI sessions (paginated)
 */
helpaiRouter.get('/admin/sessions', requireAuth, requireHelpAIAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const workspaceId = req.workspaceId || user.workspaceId || user.currentWorkspaceId;

    const sessions = await helpAIOrchestrator.getSessionHistory(workspaceId, limit);
    const stats = await helpAIOrchestrator.getSessionStats(workspaceId);

    res.json({ success: true, sessions, stats, count: sessions.length });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get sessions', message: sanitizeError(error) });
  }
});

/**
 * GET /api/helpai/admin/sessions/:id/actions
 * Admin: Get action log for a specific session
 */
helpaiRouter.get('/admin/sessions/:id/actions', requireAuth, requireHelpAIAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const actions = await helpAIOrchestrator.getSessionActionLog(id);
    res.json({ success: true, actions, count: actions.length });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get action log', message: sanitizeError(error) });
  }
});

/**
 * GET /api/helpai/admin/stats
 * Admin: Get aggregate HelpAI stats
 */
helpaiRouter.get('/admin/stats', requireAuth, requireHelpAIAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user.workspaceId || user.currentWorkspaceId;
    const stats = await helpAIOrchestrator.getSessionStats(workspaceId);
    res.json({ success: true, stats });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get stats', message: sanitizeError(error) });
  }
});

/**
 * GET /api/helpai/faqs/search
 * Dynamic FAQ search from database
 */
helpaiRouter.get('/faqs/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 5), 500);

    if (!query) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const faqs = await helpAIOrchestrator.readFaqsFromDb(query, limit);
    res.json({ success: true, faqs, count: faqs.length });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to search FAQs', message: sanitizeError(error) });
  }
});

// ============================================================================
// GET /session/:sessionId — fetch session + action log by ID (admin/agent use)
// ============================================================================

helpaiRouter.get('/session/:sessionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const [session] = await db.select().from(helpaiSessions).where(eq(helpaiSessions.id, sessionId)).limit(1);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const actions = await db.select().from(helpaiActionLog)
      .where(eq(helpaiActionLog.sessionId, sessionId))
      .orderBy(asc(helpaiActionLog.createdAt));
    res.json({ session, actions });
  } catch (error: unknown) {
    log.error("[HelpAI] session GET error:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
});

// ============================================================================
// HELPAI ADMIN ENDPOINTS — action-log, v2 activity, FAQ gaps, command-bus
// NOTE: /admin/stats and /admin/sessions are handled above (lines ~937/970) with
//       requireHelpAIAccess (ADMIN role). ADMIN_ROLES is used by action-log + v2/*.
// ============================================================================

const ADMIN_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

helpaiRouter.get('/admin/action-log', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const platformRole = await getUserPlatformRole(userId);
    if (!platformRole || !ADMIN_ROLES.includes(platformRole)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { workspaceId, sessionId } = req.query;
    const conditions: any[] = [];
    if (workspaceId) conditions.push(eq(helpaiActionLog.workspaceId, workspaceId as string));
    if (sessionId) conditions.push(eq(helpaiActionLog.sessionId, sessionId as string));

    const logs = await db.select().from(helpaiActionLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(helpaiActionLog.createdAt))
      .limit(200);

    res.json({ logs, total: logs.length });
  } catch (error: unknown) {
    log.error("[HelpAI] admin/action-log error:", error);
    res.status(500).json({ message: "Failed to fetch action logs" });
  }
});

// ============================================================================
// HELPAI v2 ROUTES — Phase 3/4/6/8/9/10 (HelpAI Complete System spec)
// ============================================================================

helpaiRouter.get('/v2/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const platformRole = await getUserPlatformRole(userId);
    if (!platformRole || !ADMIN_ROLES.includes(platformRole)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { workspaceId, limit: limitParam = '20' } = req.query;
    const limitN = Math.min(parseInt(limitParam as string) || 20, 100);

    const convConditions: any[] = [];
    if (workspaceId) convConditions.push(eq(helpaiConversations.workspaceId, workspaceId as string));

    const [conversations, slaLogs, proactiveAlerts, faqGaps, commandBus] = await Promise.allSettled([
      db.select().from(helpaiConversations)
        .where(convConditions.length ? and(...convConditions) : undefined)
        .orderBy(desc(helpaiConversations.createdAt))
        .limit(limitN),
      db.select().from(helpaiSlaLog)
        .where(workspaceId ? eq(helpaiSlaLog.workspaceId, workspaceId as string) : undefined)
        .orderBy(desc(helpaiSlaLog.createdAt))
        .limit(limitN),
      db.select().from(helpaiProactiveAlerts)
        .where(workspaceId ? eq(helpaiProactiveAlerts.workspaceId, workspaceId as string) : undefined)
        .orderBy(desc(helpaiProactiveAlerts.createdAt))
        .limit(limitN),
      db.select().from(helpaiFaqGaps)
        .where(and(
          workspaceId ? eq(helpaiFaqGaps.workspaceId, workspaceId as string) : undefined,
          eq(helpaiFaqGaps.flaggedForFaqCreation, true),
        ))
        .orderBy(desc(helpaiFaqGaps.createdAt))
        .limit(limitN),
      db.select().from(trinityHelpaiCommandBusTable)
        .where(workspaceId ? eq(trinityHelpaiCommandBusTable.workspaceId, workspaceId as string) : undefined)
        .orderBy(desc(trinityHelpaiCommandBusTable.createdAt))
        .limit(limitN),
    ]);

    const convData = conversations.status === 'fulfilled' ? conversations.value : [];
    const slaData = slaLogs.status === 'fulfilled' ? slaLogs.value : [];
    const alertsData = proactiveAlerts.status === 'fulfilled' ? proactiveAlerts.value : [];
    const gapsData = faqGaps.status === 'fulfilled' ? faqGaps.value : [];
    const busData = commandBus.status === 'fulfilled' ? commandBus.value : [];

    const activeCount = convData.filter(c => c.status === 'active').length;
    const handedOffCount = convData.filter(c => c.humanHandoffActive).length;
    const criticalCount = convData.filter(c => c.priority === 'critical').length;
    const slaBreaches = slaData.filter(s => !s.firstResponseMet || !s.resolutionMet).length;
    const pendingAlerts = alertsData.filter(a => !a.acknowledged).length;

    res.json({
      success: true,
      summary: {
        activeConversations: activeCount,
        handedOff: handedOffCount,
        critical: criticalCount,
        slaBreaches,
        pendingAlerts,
        faqGapsPending: gapsData.length,
        commandBusPending: busData.filter(b => b.status === 'sent').length,
      },
      conversations: convData,
      slaLogs: slaData,
      proactiveAlerts: alertsData,
      faqGaps: gapsData,
      commandBus: busData,
    });
  } catch (error: unknown) {
    log.error("[HelpAI v2] /activity error:", error);
    res.status(500).json({ message: "Failed to fetch HelpAI activity" });
  }
});

helpaiRouter.post('/v2/proactive-alerts/:alertId/acknowledge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { alertId } = req.params;
    const workspaceId = req.workspaceId;

    // Scope the update to this workspace — prevents cross-tenant alert acknowledgement
    const whereClause = workspaceId
      ? and(eq(helpaiProactiveAlerts.id, alertId), eq(helpaiProactiveAlerts.workspaceId, workspaceId))
      : eq(helpaiProactiveAlerts.id, alertId);

    const [updated] = await db.update(helpaiProactiveAlerts)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(whereClause)
      .returning({ id: helpaiProactiveAlerts.id });

    if (!updated) {
      return res.status(404).json({ message: "Alert not found or access denied" });
    }

    res.json({ success: true, alertId });
  } catch (error: unknown) {
    log.error("[HelpAI v2] acknowledge alert error:", error);
    res.status(500).json({ message: "Failed to acknowledge alert" });
  }
});

helpaiRouter.get('/v2/faq-gaps', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const platformRole = await getUserPlatformRole(userId);
    if (!platformRole || !ADMIN_ROLES.includes(platformRole)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { workspaceId } = req.query;
    const gaps = await db.select().from(helpaiFaqGaps)
      .where(and(
        workspaceId ? eq(helpaiFaqGaps.workspaceId, workspaceId as string) : undefined,
        eq(helpaiFaqGaps.flaggedForFaqCreation, true),
      ))
      .orderBy(desc(helpaiFaqGaps.createdAt))
      .limit(50);

    res.json({ success: true, gaps, total: gaps.length });
  } catch (error: unknown) {
    log.error("[HelpAI v2] faq-gaps error:", error);
    res.status(500).json({ message: "Failed to fetch FAQ gaps" });
  }
});

helpaiRouter.get('/v2/command-bus', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const platformRole = await getUserPlatformRole(userId);
    if (!platformRole || !ADMIN_ROLES.includes(platformRole)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { workspaceId, direction, status } = req.query;
    const conditions: any[] = [];
    if (workspaceId) conditions.push(eq(trinityHelpaiCommandBusTable.workspaceId, workspaceId as string));
    if (direction) conditions.push(eq(trinityHelpaiCommandBusTable.direction, direction as string));
    if (status) conditions.push(eq(trinityHelpaiCommandBusTable.status, status as string));

    const entries = await db.select().from(trinityHelpaiCommandBusTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(trinityHelpaiCommandBusTable.createdAt))
      .limit(50);

    res.json({ success: true, entries, total: entries.length });
  } catch (error: unknown) {
    log.error("[HelpAI v2] command-bus error:", error);
    res.status(500).json({ message: "Failed to fetch command bus" });
  }
});
