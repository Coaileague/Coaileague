/**
 * HelpAI Routes - Phases 2-5
 * API orchestration endpoints for registry, integrations, and audit logging
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';
import { type AuthenticatedRequest } from './rbac';
import { helpaiRegistryService } from './services/helpai/helpaiRegistryService';
import { helpaiIntegrationService } from './services/helpai/helpaiIntegrationService';
import { helpaiAuditService } from './services/helpai/helpaiAuditService';
import { PERMISSIONS, ROLES, ROLE_HIERARCHY } from '@shared/platformConfig';
import { z } from 'zod';

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
    } catch (error: any) {
      console.error('[HelpAI] Registry error:', error);

      await helpaiAuditService.logAuditEvent({
        workspaceId: req.user?.currentWorkspaceId || 'unknown',
        userId: req.user?.id,
        action: 'api_call',
        apiName: 'REGISTRY_QUERY',
        status: 'error',
        responseMessage: error.message,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.user?.id || 'unknown',
      });

      res.status(500).json({
        error: 'Failed to retrieve registry',
        message: error.message,
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to retrieve API',
        message: error.message,
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
      const workspaceId = req.user?.currentWorkspaceId;
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
    } catch (error: any) {
      console.error('[HelpAI] Integration config error:', error);

      await helpaiAuditService.logAuditEvent({
        workspaceId: req.user?.currentWorkspaceId || 'unknown',
        userId: req.user?.id,
        action: 'integration_enable',
        status: 'error',
        responseMessage: error.message,
        requestPayload: req.body,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.user?.id || 'unknown',
      });

      res.status(500).json({
        error: 'Failed to configure integration',
        message: error.message,
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
      const workspaceId = req.user?.currentWorkspaceId;
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to retrieve integrations',
        message: error.message,
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
      const workspaceId = req.user?.currentWorkspaceId;
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
    } catch (error: any) {
      console.error('[HelpAI] Audit log error:', error);
      res.status(500).json({
        error: 'Failed to retrieve audit logs',
        message: error.message,
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
      const workspaceId = req.user?.currentWorkspaceId;
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
    } catch (error: any) {
      console.error('[HelpAI] Audit export error:', error);
      res.status(500).json({
        error: 'Failed to export audit logs',
        message: error.message,
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
      const workspaceId = req.user?.currentWorkspaceId;
      let auditStats = null;

      if (workspaceId) {
        auditStats = await helpaiAuditService.getAuditStats(workspaceId);
      }

      res.json({
        success: true,
        registry: registryStats,
        audit: auditStats,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to retrieve statistics',
        message: error.message,
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to verify audit log integrity',
        message: error.message,
      });
    }
  }
);

// ============================================================================
// HELPAI ACTION ORCHESTRATOR ROUTES
// Universal action handler that routes all actions through AI Brain
// ============================================================================

import { helpaiOrchestrator, type ActionRequest } from './services/helpai/helpaiActionOrchestrator';

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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get available actions',
        message: error.message
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get test tools',
        message: error.message
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to execute action',
        message: error.message
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get health status',
        message: error.message
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
        userRole: req.user?.role || 'employee'
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
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to process command',
        message: error.message
      });
    }
  }
);
