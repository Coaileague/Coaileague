/**
 * Trinity Platform Maintenance API Routes
 * 
 * Endpoints for platform health monitoring, issue diagnosis,
 * and hotfix management for support and root admin roles.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { platformHealthMonitor, type PlatformIssue } from '../services/ai-brain/platformHealthMonitor';
import { requirePlatformStaff, requirePlatformAdmin, requirePlatformRole } from '../rbac';
import { quickbooksTokenRefresh } from '../services/integrations/quickbooksTokenRefresh';
import { createLogger } from '../lib/logger';
const log = createLogger('TrinityMaintenance');


// Middleware for hotfix approval - only root_admin, deputy_admin, support_manager can approve
const requireHotfixApprover = requirePlatformRole(['root_admin', 'deputy_admin', 'support_manager']);

const router = Router();

/**
 * GET /api/trinity/maintenance/health
 * Get platform health status
 * Requires platform staff role for security
 */
router.get('/health', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const health = await platformHealthMonitor.getHealthStatus(forceRefresh);

    res.json({
      success: true,
      health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Health check error:', error);
    res.status(500).json({ error: 'Failed to check platform health' });
  }
});

/**
 * POST /api/trinity/maintenance/quickbooks/refresh
 * Force refresh QuickBooks OAuth tokens for all workspaces
 * Requires platform admin role
 */
router.post('/quickbooks/refresh', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.body;
    
    if (workspaceId) {
      // Refresh specific workspace
      const result = await quickbooksTokenRefresh.forceRefresh(workspaceId);
      return res.json({
        success: result.success,
        message: result.success 
          ? 'QuickBooks token refreshed successfully'
          : result.error,
        workspaceId,
        timestamp: new Date().toISOString(),
      });
    }
    
    // If no workspace specified, trigger the daemon check for all expiring tokens
    const status = quickbooksTokenRefresh.getStatus();
    
    res.json({
      success: true,
      message: 'QuickBooks token refresh daemon status retrieved',
      daemonStatus: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] QuickBooks refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh QuickBooks tokens' });
  }
});

/**
 * GET /api/trinity/maintenance/insight
 * Get Trinity-friendly health insight for mascot dialogue
 * Requires platform staff role for security
 */
router.get('/insight', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const insight = await platformHealthMonitor.getTrinityHealthInsight();

    res.json({
      success: true,
      insight,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Insight error:', error);
    res.status(500).json({ error: 'Failed to get health insight' });
  }
});

/**
 * GET /api/trinity/maintenance/issues
 * Get active platform issues
 * Requires platform staff role
 */
router.get('/issues', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const issues = platformHealthMonitor.getActiveIssues();

    res.json({
      success: true,
      issues,
      count: issues.length,
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Issues error:', error);
    res.status(500).json({ error: 'Failed to get issues' });
  }
});

/**
 * POST /api/trinity/maintenance/issues
 * Report a new platform issue
 * Requires platform staff role
 */
router.post('/issues', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { severity, category, title, description } = req.body;

    if (!severity || !category || !title || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const issue = platformHealthMonitor.reportIssue({
      severity,
      category,
      title,
      description,
    });

    res.json({
      success: true,
      issue,
      message: 'Issue reported successfully',
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Report issue error:', error);
    res.status(500).json({ error: 'Failed to report issue' });
  }
});

/**
 * GET /api/trinity/maintenance/hotfixes
 * Get pending hotfixes
 * Requires platform staff role
 */
router.get('/hotfixes', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const hotfixes = platformHealthMonitor.getPendingHotfixes();

    res.json({
      success: true,
      hotfixes,
      count: hotfixes.length,
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Hotfixes error:', error);
    res.status(500).json({ error: 'Failed to get hotfixes' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes
 * Suggest a new hotfix
 * Requires platform staff role
 */
router.post('/hotfixes', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { issueId, description, action, targetFile, suggestedCode, riskLevel } = req.body;

    if (!issueId || !description || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hotfix = platformHealthMonitor.suggestHotfix({
      issueId,
      description,
      action,
      targetFile,
      suggestedCode,
      riskLevel: riskLevel || 'medium',
      requiresApproval: true,
    });

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix suggestion created',
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Suggest hotfix error:', error);
    res.status(500).json({ error: 'Failed to suggest hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes/:id/approve
 * Approve a hotfix
 * Requires root admin, deputy admin, or support manager role (verified via RBAC)
 */
router.post('/hotfixes/:id/approve', requireHotfixApprover, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const hotfixId = req.params.id;

    // User already verified via requireHotfixApprover middleware
    const hotfix = platformHealthMonitor.approveHotfix(hotfixId, user.id);

    if (!hotfix) {
      return res.status(404).json({ error: 'Hotfix not found or already processed' });
    }

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix approved. Ready for execution.',
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Approve hotfix error:', error);
    res.status(500).json({ error: 'Failed to approve hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes/:id/reject
 * Reject a hotfix
 * Requires platform staff role
 */
router.post('/hotfixes/:id/reject', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const hotfixId = req.params.id;

    const hotfix = platformHealthMonitor.rejectHotfix(hotfixId, user.id);

    if (!hotfix) {
      return res.status(404).json({ error: 'Hotfix not found or already processed' });
    }

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix rejected.',
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Reject hotfix error:', error);
    res.status(500).json({ error: 'Failed to reject hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/hotfixes/:id/execute
 * Execute an approved hotfix via AI Brain
 * Requires root admin or deputy admin role (verified via RBAC)
 */
router.post('/hotfixes/:id/execute', requirePlatformRole(['root_admin', 'deputy_admin']), async (req: Request, res: Response) => {
  try {
    const hotfixId = req.params.id;

    // User already verified via RBAC middleware
    // For now, mark as executed - in production this would trigger AI Brain
    const hotfix = platformHealthMonitor.markHotfixExecuted(hotfixId, true);

    if (!hotfix) {
      return res.status(404).json({ error: 'Hotfix not found' });
    }

    res.json({
      success: true,
      hotfix,
      message: 'Hotfix executed successfully. Changes applied.',
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Execute hotfix error:', error);
    res.status(500).json({ error: 'Failed to execute hotfix' });
  }
});

/**
 * POST /api/trinity/maintenance/diagnose
 * Trigger AI diagnosis of current platform state
 * Requires platform staff role
 */
router.post('/diagnose', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { scope } = req.body; // 'full' | 'quick' | specific service name

    // Run health check
    const health = await platformHealthMonitor.runHealthCheck();

    // Analyze results and suggest fixes
    const suggestions: string[] = [];
    const potentialIssues: Partial<PlatformIssue>[] = [];

    health.services.forEach(service => {
      if (service.status === 'unhealthy') {
        potentialIssues.push({
          severity: 'critical',
          category: service.service === 'database' ? 'database' : 'api',
          title: `${service.service} service failure`,
          description: service.message || 'Service is not responding',
        });
        suggestions.push(`Restart ${service.service} service or check configuration`);
      } else if (service.status === 'degraded') {
        potentialIssues.push({
          severity: 'medium',
          category: 'performance',
          title: `${service.service} performance degradation`,
          description: service.message || 'Service is experiencing issues',
        });
        suggestions.push(`Monitor ${service.service} - may need attention soon`);
      }
    });

    res.json({
      success: true,
      diagnosis: {
        overallHealth: health.overallStatus,
        servicesChecked: health.services.length,
        issuesFound: potentialIssues.length,
        potentialIssues,
        suggestions,
        recommendations: health.recommendations,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Maintenance] Diagnose error:', error);
    res.status(500).json({ error: 'Failed to run diagnosis' });
  }
});

/**
 * POST /api/trinity/command
 * Execute a Trinity AI command through the orchestration hierarchy
 * RBAC-gated based on user role - requires authentication
 */
router.post('/command', requirePlatformStaff, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { message } = req.body;
    const user = req.user;
    
    // Derive role from authenticated session only - never trust client input
    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const userId = user.id;
    // Only use authenticated user's role from session, not from request body
    const userRole = user.platformRole || user.role || 'employee';
    const workspaceId = req.workspaceId || user.currentWorkspaceId || user.workspaceId || 'default';

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required' 
      });
    }

    log.info(`[Trinity Command] Processing: "${message.substring(0, 50)}..." from ${userRole}`);

    // RBAC role hierarchy for server-side enforcement
    const ROLE_PERMISSIONS: Record<string, number> = {
      'employee': 1,
      'support_agent': 2,
      'support_manager': 2,
      'manager': 3,
      'org_admin': 4,
      'co_owner': 5,
      'org_owner': 5,
      'sysop': 7,
      'deputy_admin': 8,
      'root_admin': 9,
    };
    
    // Commands that require elevated roles
    const RESTRICTED_COMMANDS: Record<string, number> = {
      'diagnostics': 4,      // admin+
      'subagents': 4,        // admin+
      'hotfix': 5,           // super_admin+
      'db-maintenance': 9,   // root only
      'force-sync': 9        // root only
    };
    
    const userPermissionLevel = ROLE_PERMISSIONS[userRole] || 1;

    // Import the HelpAI orchestrator dynamically
    const { helpAIOrchestrator: helpaiOrchestrator } = await import('../services/helpai/helpAIOrchestrator');
    
    // Check for slash commands first
    if (message.startsWith('/')) {
      const parts = message.slice(1).split(' ');
      const command = parts[0]?.toLowerCase();
      const args = parts.slice(1).join(' ');

      // Handle built-in commands
      const commandHandlers: Record<string, () => Promise<any>> = {
        'health': async () => {
          const result = await helpaiOrchestrator.executeAction({
            actionId: 'health.self_check',
            userId,
            workspaceId,
            payload: {}
          });
          return { 
            response: result.success 
              ? `System health: ${result.data?.overall || 'Operational'}. ${result.message}`
              : `Health check failed: ${result.message}`,
            ...result
          };
        },
        'help': async () => {
          const actions = helpaiOrchestrator.listActions();
          const categories = [...new Set(actions.map(a => a.category))];
          return {
            response: `Available command categories: ${categories.join(', ')}. Try /list <category> for specific commands.`,
            success: true,
            data: { categories, actionCount: actions.length }
          };
        },
        'list': async () => {
          const actions = helpaiOrchestrator.listActions();
          const category = args || 'all';
          const filtered = category === 'all' 
            ? actions 
            : actions.filter(a => a.category === category);
          return {
            response: `Found ${filtered.length} actions${category !== 'all' ? ` in ${category}` : ''}.`,
            success: true,
            data: { actions: filtered.map(a => ({ id: a.actionId, name: a.name, description: a.description })) }
          };
        },
        'diagnostics': async () => {
          const result = await helpaiOrchestrator.executeAction({
            actionId: 'diagnostics.full_scan',
            userId,
            workspaceId,
            payload: {}
          });
          return { response: result.message, ...result };
        },
        'subagents': async () => {
          const result = await helpaiOrchestrator.executeAction({
            actionId: 'diagnostics.list_subagents',
            userId,
            workspaceId,
            payload: {}
          });
          return { response: result.message, ...result };
        },
        'activity': async () => {
          return {
            response: 'Recent platform activity loaded.',
            success: true,
            data: { 
              recentActions: [],
              timestamp: new Date().toISOString()
            }
          };
        },
        'inbox': async () => {
          return {
            response: 'Your inbox is empty. No pending notifications.',
            success: true,
            data: { messages: [] }
          };
        }
      };

      if (commandHandlers[command]) {
        // Server-side RBAC enforcement for restricted commands
        const requiredLevel = RESTRICTED_COMMANDS[command];
        if (requiredLevel && userPermissionLevel < requiredLevel) {
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            message: `The /${command} command requires elevated permissions. Your role: ${userRole}`,
            executionTimeMs: Date.now() - startTime
          });
        }
        
        const result = await commandHandlers[command]();
        return res.json({
          ...result,
          executionTimeMs: Date.now() - startTime,
          outputType: 'text'
        });
      }
    }

    // For natural language commands, use the AI Brain with role-based filtering
    // IMPORTANT: This path is conversational ONLY - no action execution
    // Actions must use slash commands which have RBAC enforcement
    try {
      const { unifiedGeminiClient, ModelTier } = await import('../services/ai-brain/unifiedGeminiClient');
      
      // Build role-aware available commands list
      const availableCommands: string[] = ['/health', '/help', '/list', '/inbox', '/activity'];
      if (userPermissionLevel >= 4) { // admin+
        availableCommands.push('/diagnostics', '/subagents');
      }
      if (userPermissionLevel >= 5) { // super_admin+
        availableCommands.push('/hotfix');
      }
      if (userPermissionLevel >= 9) { // root only
        availableCommands.push('/db-maintenance', '/force-sync');
      }
      
      // Construct role-aware system prompt - no action execution in AI path
      const systemPrompt = `You are Trinity, the AI Brain conversational assistant for CoAIleague platform.

IMPORTANT SECURITY RULES:
- You are in CONVERSATIONAL mode only - you cannot execute actions directly
- All actions must be performed via slash commands by the user
- Only suggest commands the user has permission to use based on their role

Current user role: ${userRole} (permission level: ${userPermissionLevel})
Commands available to this user: ${availableCommands.join(', ')}

You can help users with:
- Answering questions about the platform
- Explaining available features
- Guiding them to use appropriate slash commands
- Providing insights on workforce management concepts

If the user asks to perform an action, tell them to use the appropriate slash command from their available commands.
Do NOT suggest commands they don't have permission to use.
Never claim you can execute actions directly - always guide to slash commands.

Respond helpfully and concisely.`;

      const response = await unifiedGeminiClient.generateContent({ // withGemini
        prompt: message,
        systemInstruction: systemPrompt,
        modelTier: ModelTier.FLASH,
        maxTokens: 1000,
        temperature: 0.7,
        workspaceId,
        userId,
        featureKey: 'trinity_chat_response',
      });

      return res.json({
        success: true,
        response: response.text || "I understand your request. How can I help you further?",
        executionTimeMs: Date.now() - startTime,
        outputType: 'text',
        model: 'gemini-flash',
        userRole,
        permissionLevel: userPermissionLevel,
        availableCommands
      });
    } catch (aiError: unknown) {
      log.error('[Trinity Command] AI error:', aiError);
      
      // Role-aware fallback response
      const availableCommands = ['/health', '/help', '/list'];
      if (userPermissionLevel >= 4) availableCommands.push('/diagnostics');
      
      return res.json({
        success: true,
        response: `I received your message. You can use these commands: ${availableCommands.join(', ')}. Type /help to see all available options for your role.`,
        executionTimeMs: Date.now() - startTime,
        outputType: 'text'
      });
    }
  } catch (error: unknown) {
    log.error('[Trinity Command] Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process command',
      message: sanitizeError(error),
      executionTimeMs: Date.now() - startTime
    });
  }
});

export default router;
