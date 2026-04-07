/**
 * Onboarding Assistant Routes
 * API endpoints for organization onboarding diagnostics and self-healing
 * Integrates with AI Brain for automated workspace validation
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response } from 'express';
import { type AuthenticatedRequest, attachWorkspaceId, hasPlatformWideAccess, requirePlatformStaff } from '../rbac';
import { orgOnboardingAssistant } from '../services/ai-brain/orgOnboardingAssistant';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('OnboardingAssistantRoutes');


export const onboardingAssistantRouter = Router();

onboardingAssistantRouter.use(requireAuth);

/**
 * GET /api/onboarding-assistant/diagnostics
 * Run comprehensive diagnostics for current workspace
 */
onboardingAssistantRouter.get('/diagnostics', attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace context required',
        message: 'Please select a workspace to run diagnostics'
      });
    }

    const report = await orgOnboardingAssistant.runDiagnostics(workspaceId);
    
    res.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    log.error('[OnboardingAssistant] Diagnostics error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/onboarding-assistant/diagnostics/:workspaceId
 * Run diagnostics for a specific workspace (platform admin access only)
 */
onboardingAssistantRouter.get('/diagnostics/:workspaceId', requirePlatformStaff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const report = await orgOnboardingAssistant.runDiagnostics(workspaceId);
    
    res.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    log.error('[OnboardingAssistant] Diagnostics error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/onboarding-assistant/auto-fix
 * Apply automatic fixes for detected issues
 */
onboardingAssistantRouter.post('/auto-fix', attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { fixActions } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace context required',
        message: 'Please select a workspace to apply fixes'
      });
    }

    if (!fixActions || !Array.isArray(fixActions) || fixActions.length === 0) {
      return res.status(400).json({ 
        error: 'Fix actions required',
        message: 'Please specify which fixes to apply'
      });
    }

    const result = await orgOnboardingAssistant.applyAutoFixes(workspaceId, fixActions);
    
    res.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    log.error('[OnboardingAssistant] Auto-fix error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/onboarding-assistant/routing-config
 * Get data routing configuration for current workspace
 */
onboardingAssistantRouter.get('/routing-config', attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace context required',
        message: 'Please select a workspace'
      });
    }

    const config = await orgOnboardingAssistant.getDataRoutingConfig(workspaceId);
    
    res.json({
      success: true,
      config,
    });
  } catch (error: unknown) {
    log.error('[OnboardingAssistant] Routing config error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/onboarding-assistant/validate-routing
 * Validate universal routing for all features
 */
onboardingAssistantRouter.get('/validate-routing', attachWorkspaceId, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace context required',
        message: 'Please select a workspace'
      });
    }

    const validation = await orgOnboardingAssistant.validateUniversalRouting(workspaceId);
    
    res.json({
      success: true,
      validation,
    });
  } catch (error: unknown) {
    log.error('[OnboardingAssistant] Routing validation error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});
