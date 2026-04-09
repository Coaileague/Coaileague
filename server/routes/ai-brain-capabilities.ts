/**
 * AI Brain Orchestrator Capabilities API Routes
 * 
 * Exposes the new AI Brain capabilities:
 * - Service Control
 * - Feature Toggle Management  
 * - Console Command Execution
 * - End User Bot Support
 * - Support Staff Assistance
 */

import express, { Router, Request, Response } from 'express';
// @ts-expect-error — TS migration: fix in refactoring sprint
import { requireAuth, type AuthenticatedRequest } from '../auth';
import {
  serviceController,
  featureToggleManager,
  consoleCommandExecutor,
  endUserBotSupport,
  supportStaffAssistant,
  AI_BRAIN_CAPABILITIES,
} from '../services/ai-brain/orchestratorCapabilities';

export const aiBrainCapabilitiesRouter: Router = express.Router();

// ============================================================================
// CAPABILITIES OVERVIEW
// ============================================================================

/**
 * GET /api/ai-brain/capabilities
 * Get all AI Brain orchestrator capabilities
 */
aiBrainCapabilitiesRouter.get('/capabilities', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      capabilities: AI_BRAIN_CAPABILITIES,
      version: '2.0',
      description: 'AI Brain Orchestrator with full platform control',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get capabilities', message: error.message });
  }
});

// ============================================================================
// SERVICE CONTROL ROUTES
// ============================================================================

/**
 * GET /api/ai-brain/services
 * Get all service statuses
 */
aiBrainCapabilitiesRouter.get('/services', requireAuth, async (req: Request, res: Response) => {
  try {
    const statuses = await serviceController.getAllServicesStatus();
    res.json({ success: true, services: statuses });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get services', message: error.message });
  }
});

/**
 * GET /api/ai-brain/services/:name
 * Get specific service status
 */
aiBrainCapabilitiesRouter.get('/services/:name', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const status = await serviceController.getServiceStatus(name);
    
    if (!status) {
      return res.status(404).json({ error: `Service '${name}' not found` });
    }
    
    res.json({ success: true, service: status });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get service status', message: error.message });
  }
});

/**
 * POST /api/ai-brain/services/:name/restart
 * Restart a service (requires admin)
 */
aiBrainCapabilitiesRouter.post('/services/:name/restart', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name } = req.params;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID required' });
    }
    
    const result = await serviceController.restartService(name, userId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to restart service', message: error.message });
  }
});

// ============================================================================
// FEATURE TOGGLE ROUTES
// ============================================================================

/**
 * GET /api/ai-brain/features
 * Get all feature toggles
 */
aiBrainCapabilitiesRouter.get('/features', requireAuth, async (req: Request, res: Response) => {
  try {
    const toggles = await featureToggleManager.getAllToggles();
    const features = await featureToggleManager.listAllFeatures();
    
    res.json({
      success: true,
      toggles,
      features,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get features', message: error.message });
  }
});

/**
 * GET /api/ai-brain/features/:path
 * Get specific feature toggle
 */
aiBrainCapabilitiesRouter.get('/features/:path', requireAuth, async (req: Request, res: Response) => {
  try {
    const { path } = req.params;
    const value = await featureToggleManager.getToggle(path);
    
    res.json({ success: true, path, enabled: value });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get feature', message: error.message });
  }
});

/**
 * POST /api/ai-brain/features/toggle
 * Toggle a feature on/off
 */
aiBrainCapabilitiesRouter.post('/features/toggle', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { featurePath, enabled, reason } = req.body;
    const userId = authReq.user?.id;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!featurePath || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'featurePath and enabled (boolean) are required' });
    }
    
    const result = await featureToggleManager.setToggle({
      featurePath,
      enabled,
      reason: reason || 'No reason provided',
      userId: userId!,
      workspaceId,
    });
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to toggle feature', message: error.message });
  }
});

/**
 * GET /api/ai-brain/features/history
 * Get feature toggle history
 */
aiBrainCapabilitiesRouter.get('/features/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = featureToggleManager.getToggleHistory(limit);
    
    res.json({ success: true, history });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get history', message: error.message });
  }
});

// ============================================================================
// CONSOLE COMMAND ROUTES
// ============================================================================

/**
 * GET /api/ai-brain/console/commands
 * Get list of allowed console commands
 */
aiBrainCapabilitiesRouter.get('/console/commands', requireAuth, async (req: Request, res: Response) => {
  try {
    const commands = consoleCommandExecutor.listAllowedCommands();
    
    res.json({
      success: true,
      commands,
      usage: 'POST /api/ai-brain/console/execute with { command: "category:action", args: {} }',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list commands', message: error.message });
  }
});

/**
 * POST /api/ai-brain/console/execute
 * Execute a console command
 */
aiBrainCapabilitiesRouter.post('/console/execute', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { command, args, targetWorkspace, dryRun } = req.body;
    const userId = authReq.user?.id;
    
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }
    
    const result = await consoleCommandExecutor.executeCommand(
      { command, args, targetWorkspace, dryRun },
      userId!
    );
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to execute command', message: error.message });
  }
});

/**
 * GET /api/ai-brain/console/log
 * Get command execution history
 */
aiBrainCapabilitiesRouter.get('/console/log', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const log = consoleCommandExecutor.getCommandLog(limit);
    
    res.json({ success: true, log });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get command log', message: error.message });
  }
});

// ============================================================================
// END USER BOT SUPPORT ROUTES
// ============================================================================

/**
 * POST /api/ai-brain/bot/assist
 * Get AI assistance for end users
 */
aiBrainCapabilitiesRouter.post('/bot/assist', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { query, context } = req.body;
    const userId = authReq.user?.id;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const result = await endUserBotSupport.assistUser({
      userId: userId!,
      workspaceId: workspaceId!,
      query,
      context,
    });
    
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to assist user', message: error.message });
  }
});

/**
 * GET /api/ai-brain/bot/quickhelp/:topic
 * Get quick help on a topic
 */
aiBrainCapabilitiesRouter.get('/bot/quickhelp/:topic', requireAuth, async (req: Request, res: Response) => {
  try {
    const { topic } = req.params;
    const help = await endUserBotSupport.getQuickHelp(topic);
    
    res.json({ success: true, topic, help });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get quick help', message: error.message });
  }
});

// ============================================================================
// SUPPORT STAFF ASSISTANT ROUTES
// ============================================================================

/**
 * GET /api/ai-brain/support/knowledge
 * Search support knowledge base
 */
aiBrainCapabilitiesRouter.get('/support/knowledge', requireAuth, async (req: Request, res: Response) => {
  try {
    const { query, category } = req.query;
    
    let results;
    if (category) {
      results = await supportStaffAssistant.getKnowledgeByCategory(category as string);
    } else if (query) {
      results = await supportStaffAssistant.searchKnowledge(query as string);
    } else {
      return res.status(400).json({ error: 'query or category parameter required' });
    }
    
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to search knowledge', message: error.message });
  }
});

/**
 * POST /api/ai-brain/support/suggest-response
 * Get AI-suggested response for a support ticket
 */
aiBrainCapabilitiesRouter.post('/support/suggest-response', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { ticketSummary } = req.body;
    const userId = authReq.user?.id;
    const workspaceId = authReq.user?.currentWorkspaceId || 'platform';
    
    if (!ticketSummary) {
      return res.status(400).json({ error: 'ticketSummary is required' });
    }
    
    const result = await supportStaffAssistant.suggestResponse(ticketSummary, workspaceId, userId!);
    
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to suggest response', message: error.message });
  }
});

/**
 * GET /api/ai-brain/support/escalation
 * Get escalation path for a ticket category and severity
 */
aiBrainCapabilitiesRouter.get('/support/escalation', requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, severity } = req.query;
    
    if (!category || !severity) {
      return res.status(400).json({ error: 'category and severity parameters required' });
    }
    
    const result = await supportStaffAssistant.getEscalationPath(
      category as string,
      severity as 'low' | 'medium' | 'high' | 'critical'
    );
    
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get escalation path', message: error.message });
  }
});

export default aiBrainCapabilitiesRouter;
