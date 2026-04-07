/**
 * Support Command Console - Force-Push Updates to All Connected Clients
 * Allows support staff to force immediate sync of What's New, notifications,
 * and other platform updates via WebSocket broadcasts.
 * 
 * All actions are logged via AI Brain orchestrator.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { type AuthenticatedRequest } from '../rbac';
import { platformEventBus, publishPlatformUpdate } from '../services/platformEventBus';
import { addUpdate } from '../services/whatsNewService';
import { db } from '../db';
import { notifications, systemAuditLogs, users } from '@shared/schema';
import { broadcastToAllClients } from '../websocket';
import { animationControlService, type AnimationCommand } from '../services/animationControlService';
import { universalNotificationEngine } from '../services/universalNotificationEngine';

export const supportCommandRouter = Router();

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'];

function requireSupportRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userRole = req.platformRole || 'none';
  if (!SUPPORT_ROLES.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Support staff access required',
      requiredRoles: SUPPORT_ROLES,
    });
  }
  next();
}

function broadcastForceRefresh(type: string, payload: any) {
  const message = {
    type: 'force_refresh',
    refreshType: type,
    payload,
    timestamp: new Date().toISOString(),
  };
  const count = broadcastToAllClients(message);
  log.info(`[SupportConsole] Force broadcast sent: ${type} to ${count} clients`);
  return count;
}

/**
 * GET /api/support/command/test-broadcast
 * Debug endpoint to test WebSocket broadcast to all tabs
 * NOTE: Uses session auth - requires being logged in as support staff
 */
supportCommandRouter.get('/test-broadcast', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const testMessage = {
      type: 'force_refresh',
      refreshType: 'test_broadcast',
      payload: {
        action: 'test',
        message: `Test broadcast at ${new Date().toLocaleTimeString()}`,
        timestamp: new Date().toISOString(),
        sender: req.user?.id || 'system',
      },
    };
    
    const count = broadcastToAllClients(testMessage);
    
    log.info(`[SupportConsole] Test broadcast sent to ${count} clients`);
    
    res.json({
      success: true,
      message: `Test broadcast sent to ${count} connected clients`,
      clientCount: count,
      payload: testMessage,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Test broadcast error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/force-whats-new
 * Force push a new What's New update to all clients
 */
supportCommandRouter.post('/force-whats-new', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, category, priority, visibility, badge, version, learnMoreUrl } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // Add the update to the database
    const update = await addUpdate({
      title,
      description,
      date: new Date().toISOString().split('T')[0],
      category: category || 'announcement',
      priority: priority || 1,
      visibility: visibility || 'all',
      badge: badge || 'NEW',
      version,
      learnMoreUrl,
      isNew: true,
    });

    // Publish to the event bus (triggers WebSocket broadcast, notifications, audit log)
    await publishPlatformUpdate({
      type: 'announcement',
      category: category || 'announcement',
      title,
      description,
      version,
      priority: priority || 1,
      userId: req.user?.id,
      learnMoreUrl,
      visibility: visibility || 'all',
    });

    // Force immediate refresh on all clients
    broadcastForceRefresh('whats_new', {
      action: 'new_update',
      updateId: update.id,
      title,
      badge,
    });

    // Log the action
    await logSupportAction(req.user?.id || 'unknown', 'force_whats_new', {
      title,
      category,
      visibility,
    });

    res.json({
      success: true,
      message: 'What\'s New update pushed to all clients',
      update,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Force What\'s New error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/force-notification
 * Force push a notification to all users or specific targets
 * Supports: platform-wide, workspace-targeted, or user-specific notifications
 */
supportCommandRouter.post('/force-notification', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, message, type, targetUserIds, targetWorkspaceId, actionUrl, priority } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const notificationsCreated: string[] = [];
    let notificationScope = 'platform-wide';

    // Route through UNE for AI enrichment while maintaining force-push capability
    // Determine targeting scope and use UNE for unified notification handling
    if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      // Specific users
      notificationScope = `${targetUserIds.length} specific users`;
      for (const userId of targetUserIds) {
        const result = await universalNotificationEngine.sendNotification({
          workspaceId: targetWorkspaceId || PLATFORM_WORKSPACE_ID,
          userId,
          type: type || 'system',
          title,
          message,
          actionUrl: actionUrl || '/dashboard',
          severity: priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'info',
          metadata: { 
            forcePushed: true, 
            pushedBy: req.user?.id,
            skipFeatureCheck: true, // Admin force-push bypasses feature validation
          },
        });
        if (result.notificationIds.length > 0) {
          notificationsCreated.push(...result.notificationIds);
        }
      }
    } else if (targetWorkspaceId) {
      // All users in a specific workspace - use UNE with workspace targeting
      const result = await universalNotificationEngine.sendNotification({
        workspaceId: targetWorkspaceId,
        type: type || 'system',
        title,
        message,
        actionUrl: actionUrl || '/dashboard',
        severity: priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'info',
        metadata: { 
          forcePushed: true, 
          pushedBy: req.user?.id,
          skipFeatureCheck: true,
        },
      });
      notificationScope = `${result.recipientCount} users in workspace`;
      notificationsCreated.push(...result.notificationIds);
    } else {
      // Platform-wide - notify all users using their current workspace
      const allUsers = await db.select({ 
        id: users.id, 
        currentWorkspace: users.currentWorkspace 
      }).from(users);
      notificationScope = `${allUsers.length} users platform-wide`;
      
      // Group users by workspace for efficient UNE calls
      const usersByWorkspace = new Map<string, string[]>();
      for (const user of allUsers) {
        const wsId = user.currentWorkspace || PLATFORM_WORKSPACE_ID;
        if (!usersByWorkspace.has(wsId)) usersByWorkspace.set(wsId, []);
        usersByWorkspace.get(wsId)!.push(user.id);
      }
      
      // Send notifications per workspace for proper context
      for (const [wsId, userIds] of usersByWorkspace) {
        for (const userId of userIds) {
          const result = await universalNotificationEngine.sendNotification({
            workspaceId: wsId,
            userId,
            type: type || 'system',
            title,
            message,
            actionUrl: actionUrl || '/dashboard',
            severity: priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'info',
            metadata: { 
              forcePushed: true, 
              pushedBy: req.user?.id,
              skipFeatureCheck: true,
            },
          });
          if (result.notificationIds.length > 0) {
            notificationsCreated.push(...result.notificationIds);
          }
        }
      }
    }

    // Broadcast force refresh to trigger notification count update
    broadcastForceRefresh('notifications', {
      action: 'new_notification',
      title,
      scope: notificationScope,
      count: notificationsCreated.length,
    });

    await logSupportAction(req.user?.id || 'unknown', 'force_notification', {
      title,
      type,
      scope: notificationScope,
      targetCount: notificationsCreated.length,
    });

    res.json({
      success: true,
      message: `Notification pushed to ${notificationsCreated.length} users (${notificationScope})`,
      notificationIds: notificationsCreated,
      scope: notificationScope,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Force notification error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/force-sync
 * Force all clients to immediately refresh their cached data
 */
supportCommandRouter.post('/force-sync', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { syncTypes, reason } = req.body;
    
    // Default to syncing everything
    const types = syncTypes || ['whats_new', 'notifications', 'health'];

    // Broadcast force refresh for each type
    for (const type of types) {
      broadcastForceRefresh(type, {
        action: 'force_sync',
        reason: reason || 'Support staff initiated sync',
        timestamp: new Date().toISOString(),
      });
    }

    await logSupportAction(req.user?.id || 'unknown', 'force_sync', {
      syncTypes: types,
      reason,
    });

    res.json({
      success: true,
      message: `Force sync broadcast for: ${types.join(', ')}`,
      syncTypes: types,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Force sync error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/broadcast-message
 * Send a system-wide message to all connected clients
 */
supportCommandRouter.post('/broadcast-message', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, severity, duration, dismissible } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    broadcastForceRefresh('system_message', {
      action: 'broadcast',
      message,
      severity: severity || 'info', // info, warning, error, success
      duration: duration || 10000, // ms to show
      dismissible: dismissible !== false,
      timestamp: new Date().toISOString(),
      sender: req.user?.id,
    });

    await logSupportAction(req.user?.id || 'unknown', 'broadcast_message', {
      message: message.substring(0, 100),
      severity,
    });

    res.json({
      success: true,
      message: 'System message broadcast to all clients',
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Broadcast message error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/maintenance-mode
 * Enable/disable maintenance mode with client notification
 */
supportCommandRouter.post('/maintenance-mode', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled, message, estimatedDuration } = req.body;
    
    broadcastForceRefresh('maintenance', {
      action: enabled ? 'start' : 'end',
      enabled,
      message: message || (enabled ? 'System maintenance in progress' : 'Maintenance complete'),
      estimatedDuration,
      timestamp: new Date().toISOString(),
    });

    await logSupportAction(req.user?.id || 'unknown', 'maintenance_mode', {
      enabled,
      estimatedDuration,
    });

    res.json({
      success: true,
      message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Maintenance mode error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/invalidate-cache
 * Force clients to invalidate specific cache keys
 */
supportCommandRouter.post('/invalidate-cache', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cacheKeys, reason } = req.body;
    
    if (!cacheKeys || !Array.isArray(cacheKeys)) {
      return res.status(400).json({ error: 'cacheKeys array is required' });
    }

    broadcastForceRefresh('cache_invalidation', {
      action: 'invalidate',
      cacheKeys,
      reason: reason || 'Support staff cache clear',
      timestamp: new Date().toISOString(),
    });

    await logSupportAction(req.user?.id || 'unknown', 'invalidate_cache', {
      cacheKeys,
      reason,
    });

    res.json({
      success: true,
      message: `Cache invalidation broadcast for: ${cacheKeys.join(', ')}`,
      cacheKeys,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Cache invalidation error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/animation
 * Control universal workspace animations (show, hide, update, theme, force)
 */
supportCommandRouter.post('/animation', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const command: AnimationCommand = {
      action: req.body.action || 'show',
      mode: req.body.mode,
      mainText: req.body.mainText,
      subText: req.body.subText,
      duration: req.body.duration,
      progress: req.body.progress,
      seasonalTheme: req.body.seasonalTheme,
      source: 'support'
    };

    const result = await animationControlService.executeCommand(
      command,
      req.user?.id || 'support-console'
    );

    await logSupportAction(req.user?.id || 'unknown', 'animation_control', {
      action: command.action,
      mode: command.mode,
      mainText: command.mainText
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Animation control error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/support/command/animation/state
 * Get current animation state
 */
supportCommandRouter.get('/animation/state', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      state: animationControlService.getState(),
      currentTheme: animationControlService.getCurrentTheme(),
      availableThemes: animationControlService.getAvailableThemes(),
      availableModes: animationControlService.getAvailableModes()
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/animation/seasonal
 * Set seasonal theme for animations
 */
supportCommandRouter.post('/animation/seasonal', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { theme } = req.body;
    
    if (!theme) {
      return res.status(400).json({ error: 'Theme is required' });
    }

    const result = await animationControlService.executeCommand(
      { action: 'theme', seasonalTheme: theme, source: 'support' },
      req.user?.id || 'support-console'
    );

    await logSupportAction(req.user?.id || 'unknown', 'animation_theme_change', { theme });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Seasonal theme error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// MASCOT ORCHESTRATION - HelpAI Mascot Control via Command Console
// ============================================================================

/**
 * Mascot control state - in-memory store for real-time orchestration
 * This is broadcast to all clients via WebSocket for instant updates
 */
interface MascotOrchestrationState {
  mode: 'idle' | 'advising' | 'celebrating' | 'alerting' | 'teaching' | 'coo_advisor';
  persona: 'friendly' | 'professional' | 'playful' | 'serious' | 'motivational';
  currentEmote: string;
  currentSpeech: string | null;
  speechQueue: Array<{ message: string; duration: number; type: string }>;
  holidayTheme: string | null;
  businessFocus: 'growth' | 'sales' | 'efficiency' | 'debt' | 'general' | null;
  animationIntensity: 'subtle' | 'normal' | 'energetic';
  reactToWhatsNew: boolean;
  globalEnabled: boolean;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

let mascotState: MascotOrchestrationState = {
  mode: 'idle',
  persona: 'friendly',
  currentEmote: 'curious',
  currentSpeech: null,
  speechQueue: [],
  holidayTheme: null,
  businessFocus: 'general',
  animationIntensity: 'normal',
  reactToWhatsNew: true,
  globalEnabled: true,
  lastUpdatedBy: 'system',
  lastUpdatedAt: new Date().toISOString(),
};

function broadcastMascotState() {
  broadcastToAllClients({
    type: 'mascot_orchestration',
    action: 'state_update',
    state: mascotState,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/support/command/mascot/state
 * Get current mascot orchestration state
 */
supportCommandRouter.get('/mascot/state', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      state: mascotState,
      availableModes: ['idle', 'advising', 'celebrating', 'alerting', 'teaching', 'coo_advisor'],
      availablePersonas: ['friendly', 'professional', 'playful', 'serious', 'motivational'],
      availableEmotes: ['idle', 'curious', 'happy', 'thinking', 'excited', 'concerned', 'celebrating', 'advising'],
      availableBusinessFocus: ['growth', 'sales', 'efficiency', 'debt', 'general'],
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/mascot/control
 * Update mascot orchestration state - controls behavior, speech, themes
 */
supportCommandRouter.post('/mascot/control', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mode, persona, emote, speech, holidayTheme, businessFocus, animationIntensity, reactToWhatsNew, globalEnabled } = req.body;
    
    // Update state with provided values
    if (mode) mascotState.mode = mode;
    if (persona) mascotState.persona = persona;
    if (emote) mascotState.currentEmote = emote;
    if (speech !== undefined) mascotState.currentSpeech = speech;
    if (holidayTheme !== undefined) mascotState.holidayTheme = holidayTheme;
    if (businessFocus) mascotState.businessFocus = businessFocus;
    if (animationIntensity) mascotState.animationIntensity = animationIntensity;
    if (typeof reactToWhatsNew === 'boolean') mascotState.reactToWhatsNew = reactToWhatsNew;
    if (typeof globalEnabled === 'boolean') mascotState.globalEnabled = globalEnabled;
    
    mascotState.lastUpdatedBy = req.user?.id || 'support-console';
    mascotState.lastUpdatedAt = new Date().toISOString();
    
    // Broadcast to all clients
    broadcastMascotState();
    
    await logSupportAction(req.user?.id || 'unknown', 'mascot_control', {
      mode: mascotState.mode,
      persona: mascotState.persona,
      emote: mascotState.currentEmote,
      speech: mascotState.currentSpeech?.substring(0, 50),
    });
    
    res.json({
      success: true,
      message: 'Mascot state updated and broadcast to all clients',
      state: mascotState,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Mascot control error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/mascot/speak
 * Queue a speech message for the mascot to display
 */
supportCommandRouter.post('/mascot/speak', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, duration = 5000, type = 'announcement', immediate = false } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (immediate) {
      mascotState.currentSpeech = message;
      mascotState.speechQueue = [];
    } else {
      mascotState.speechQueue.push({ message, duration, type });
      if (!mascotState.currentSpeech) {
        mascotState.currentSpeech = message;
      }
    }
    
    mascotState.lastUpdatedBy = req.user?.id || 'support-console';
    mascotState.lastUpdatedAt = new Date().toISOString();
    
    broadcastMascotState();
    
    await logSupportAction(req.user?.id || 'unknown', 'mascot_speak', {
      message: message.substring(0, 100),
      type,
      immediate,
    });
    
    res.json({
      success: true,
      message: 'Speech queued for mascot',
      currentSpeech: mascotState.currentSpeech,
      queueLength: mascotState.speechQueue.length,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Mascot speak error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/mascot/business-advice
 * Trigger AI-powered business buddy advice generation
 */
supportCommandRouter.post('/mascot/business-advice', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { focus, workspaceId, broadcast = true, context } = req.body;
    const { geminiClient } = await import('../services/ai-brain/providers/geminiClient');
    
    const businessFocus = focus || mascotState.businessFocus || 'general';
    
    const systemPrompt = `You are HelpAI, the AI Brain for CoAIleague workforce management platform.
You are a business buddy who helps business owners grow their businesses.
Current focus area: ${businessFocus.toUpperCase()}

Generate 3 actionable business insights that are:
- Specific and practical (not generic)
- Related to workforce management and growth
- Encouraging and motivational
- Formatted as bullet points

${context ? `Additional context: ${context}` : ''}

Focus areas:
- GROWTH: Scaling team, expanding services, market opportunities
- SALES: Revenue optimization, client acquisition, pricing strategies  
- EFFICIENCY: Process automation, time savings, cost reduction
- DEBT: Cash flow management, payment collection, financial planning
- GENERAL: Overall business health and improvement`;
    
    const response = await geminiClient.generate({
      workspaceId: workspaceId || undefined,
      userId: req.user?.id || 'support-console',
      featureKey: 'coo_advisor_advice',
      systemPrompt,
      userMessage: `Generate ${businessFocus} insights for the business owner`,
      temperature: 0.8,
      maxTokens: 500,
    });
    
    const advice = response.text;
    
    if (broadcast) {
      mascotState.mode = 'coo_advisor';
      mascotState.businessFocus = businessFocus;
      mascotState.currentSpeech = advice.split('\n')[0]?.replace(/^[-*•]\s*/, '') || 'Here are some insights for your business!';
      mascotState.currentEmote = 'advising';
      mascotState.lastUpdatedBy = req.user?.id || 'support-console';
      mascotState.lastUpdatedAt = new Date().toISOString();
      
      broadcastMascotState();
      
      // Also broadcast as a mascot insight event
      broadcastToAllClients({
        type: 'mascot_insight',
        action: 'business_advice',
        focus: businessFocus,
        advice,
        timestamp: new Date().toISOString(),
      });
    }
    
    await logSupportAction(req.user?.id || 'unknown', 'mascot_business_advice', {
      focus: businessFocus,
      broadcast,
      adviceLength: advice.length,
    });
    
    res.json({
      success: true,
      focus: businessFocus,
      advice,
      broadcast,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Business advice error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/mascot/react-whats-new
 * Trigger mascot reaction to a What's New announcement
 */
supportCommandRouter.post('/mascot/react-whats-new', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, category, celebrateLevel = 'normal' } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Set mascot to celebration mode
    mascotState.mode = 'celebrating';
    mascotState.currentEmote = celebrateLevel === 'major' ? 'excited' : 'happy';
    mascotState.currentSpeech = `Exciting news! ${title}`;
    mascotState.lastUpdatedBy = req.user?.id || 'support-console';
    mascotState.lastUpdatedAt = new Date().toISOString();
    
    broadcastMascotState();
    
    // Broadcast specific What's New reaction
    broadcastToAllClients({
      type: 'mascot_whats_new_reaction',
      action: 'celebrate',
      title,
      description,
      category,
      celebrateLevel,
      emote: mascotState.currentEmote,
      timestamp: new Date().toISOString(),
    });
    
    await logSupportAction(req.user?.id || 'unknown', 'mascot_react_whats_new', {
      title,
      category,
      celebrateLevel,
    });
    
    res.json({
      success: true,
      message: 'Mascot is reacting to What\'s New',
      title,
      emote: mascotState.currentEmote,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] What\'s New reaction error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/mascot/holiday-theme
 * Set or clear holiday theme for mascot
 */
supportCommandRouter.post('/mascot/holiday-theme', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { theme } = req.body;
    
    mascotState.holidayTheme = theme || null;
    mascotState.lastUpdatedBy = req.user?.id || 'support-console';
    mascotState.lastUpdatedAt = new Date().toISOString();
    
    // Also update animation seasonal theme
    await animationControlService.executeCommand(
      { action: 'theme', seasonalTheme: theme || 'default', source: 'support' },
      req.user?.id || 'support-console'
    );
    
    broadcastMascotState();
    
    await logSupportAction(req.user?.id || 'unknown', 'mascot_holiday_theme', { theme });
    
    res.json({
      success: true,
      message: theme ? `Holiday theme set to ${theme}` : 'Holiday theme cleared',
      holidayTheme: mascotState.holidayTheme,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Holiday theme error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/mascot/reset
 * Reset mascot to default state
 */
supportCommandRouter.post('/mascot/reset', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    mascotState = {
      mode: 'idle',
      persona: 'friendly',
      currentEmote: 'curious',
      currentSpeech: null,
      speechQueue: [],
      holidayTheme: null,
      businessFocus: 'general',
      animationIntensity: 'normal',
      reactToWhatsNew: true,
      globalEnabled: true,
      lastUpdatedBy: req.user?.id || 'support-console',
      lastUpdatedAt: new Date().toISOString(),
    };
    
    broadcastMascotState();
    
    await logSupportAction(req.user?.id || 'unknown', 'mascot_reset', {});
    
    res.json({
      success: true,
      message: 'Mascot reset to default state',
      state: mascotState,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Mascot reset error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// CODE EDITOR COMMANDS - AI Brain Code Editing via Command Console
// ============================================================================

/**
 * POST /api/support/command/code/stage
 * Stage a code change for user approval
 */
supportCommandRouter.post('/code/stage', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { filePath, changeType, proposedContent, title, description, requestReason, conversationId, priority, category, affectedModule } = req.body;
    
    if (!filePath || !changeType || !title || !description) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['filePath', 'changeType', 'title', 'description']
      });
    }

    const result = await aiBrainCodeEditor.stageCodeChange({
      filePath,
      changeType,
      proposedContent,
      title,
      description,
      requestReason: requestReason || `Staged via Support Console by ${req.user?.id}`,
      conversationId,
      priority,
      category,
      affectedModule
    }, req.user?.id || 'support-console');

    await logSupportAction(req.user?.id || 'unknown', 'code_stage', {
      filePath,
      changeType,
      title,
      changeId: result.changeId
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Code stage error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/code/stage-batch
 * Stage multiple code changes as a batch
 */
supportCommandRouter.post('/code/stage-batch', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { title, description, changes, conversationId, whatsNewTitle, whatsNewDescription } = req.body;
    
    if (!title || !description || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['title', 'description', 'changes[]']
      });
    }

    const result = await aiBrainCodeEditor.stageBatchChanges({
      title,
      description,
      changes,
      conversationId,
      whatsNewTitle,
      whatsNewDescription
    }, req.user?.id || 'support-console');

    await logSupportAction(req.user?.id || 'unknown', 'code_stage_batch', {
      title,
      batchId: result.batchId,
      changesCount: changes.length
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Code stage batch error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/support/command/code/pending
 * Get all pending code changes awaiting approval
 */
supportCommandRouter.get('/code/pending', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const pendingChanges = await aiBrainCodeEditor.getPendingChanges();

    res.json({
      success: true,
      count: pendingChanges.length,
      changes: pendingChanges
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Get pending changes error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/code/approve
 * Approve a staged code change
 */
supportCommandRouter.post('/code/approve', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, notes } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    const result = await aiBrainCodeEditor.approveChange(changeId, req.user?.id || 'support-console', notes);

    await logSupportAction(req.user?.id || 'unknown', 'code_approve', {
      changeId,
      notes
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Code approve error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/code/reject
 * Reject a staged code change
 */
supportCommandRouter.post('/code/reject', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, reason } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    const result = await aiBrainCodeEditor.rejectChange(changeId, req.user?.id || 'support-console', reason);

    await logSupportAction(req.user?.id || 'unknown', 'code_reject', {
      changeId,
      reason
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Code reject error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/code/apply
 * Apply an approved code change to the codebase
 */
supportCommandRouter.post('/code/apply', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, sendWhatsNew } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    // Verify the change is in a valid state for application before proceeding
    const change = await aiBrainCodeEditor.getChangeById(changeId);
    if (!change) {
      return res.status(404).json({ error: 'Code change not found' });
    }
    if (change.status !== 'approved') {
      return res.status(400).json({ 
        error: 'Can only apply approved changes',
        currentStatus: change.status
      });
    }

    const result = await aiBrainCodeEditor.applyChange(changeId, req.user?.id || 'support-console', sendWhatsNew !== false);

    await logSupportAction(req.user?.id || 'unknown', 'code_apply', {
      changeId,
      sendWhatsNew: sendWhatsNew !== false
    });

    // Broadcast code change applied notification
    broadcastForceRefresh('code_change', {
      action: 'applied',
      changeId,
      appliedAt: result.appliedAt
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Code apply error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/code/rollback
 * Rollback a previously applied code change
 */
supportCommandRouter.post('/code/rollback', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, reason } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    // Verify the change is in a valid state for rollback before proceeding
    const change = await aiBrainCodeEditor.getChangeById(changeId);
    if (!change) {
      return res.status(404).json({ error: 'Code change not found' });
    }
    if (change.status !== 'applied') {
      return res.status(400).json({ 
        error: 'Can only rollback applied changes',
        currentStatus: change.status
      });
    }

    const result = await aiBrainCodeEditor.rollbackChange(changeId);

    await logSupportAction(req.user?.id || 'unknown', 'code_rollback', {
      changeId,
      reason
    });

    // Broadcast rollback notification
    broadcastForceRefresh('code_change', {
      action: 'rolled_back',
      changeId,
      reason
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Code rollback error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/support/command/code/change/:id
 * Get details of a specific code change
 */
supportCommandRouter.get('/code/change/:id', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const change = await aiBrainCodeEditor.getChangeById(req.params.id);
    
    if (!change) {
      return res.status(404).json({ error: 'Code change not found' });
    }

    res.json({
      success: true,
      change
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Get change error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/platform/scan-now
 * Trigger immediate AI Brain platform scan for changes
 */
supportCommandRouter.post('/platform/scan-now', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platformChangeMonitor } = await import('../services/ai-brain/platformChangeMonitor');
    
    // Log the action
    await logSupportAction(req.user?.id || 'unknown', 'platform_scan', {
      triggeredBy: req.user?.username || 'support_staff',
      timestamp: new Date().toISOString(),
    });

    // Trigger the scan
    const result = await platformChangeMonitor.triggerManualScan();

    // Broadcast notification about the scan
    broadcastForceRefresh('platform_scan', {
      action: 'completed',
      changesDetected: result.changesDetected,
      notificationsSent: result.notificationsSent,
    });

    res.json({
      success: true,
      message: 'Platform scan completed',
      ...result,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Platform scan error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/support/command/platform/scan-history
 * Get recent platform scan history
 */
supportCommandRouter.get('/platform/scan-history', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platformChangeMonitor } = await import('../services/ai-brain/platformChangeMonitor');
    
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 500);
    const history = await platformChangeMonitor.getRecentScans(limit);

    res.json({
      success: true,
      scans: history,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Scan history error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/support/command/platform/changes
 * Get recent platform change events
 */
supportCommandRouter.get('/platform/changes', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platformChangeMonitor } = await import('../services/ai-brain/platformChangeMonitor');
    
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500);
    const changes = await platformChangeMonitor.getRecentChanges(limit);

    res.json({
      success: true,
      changes,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Get changes error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/support/command/status
 * Get current status of the command console and broadcast capabilities
 */
supportCommandRouter.get('/status', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      status: 'operational',
      wsBroadcasterConnected: true,
      supportedCommands: [
        'force-whats-new',
        'force-notification', 
        'force-sync',
        'broadcast-message',
        'maintenance-mode',
        'invalidate-cache',
        'animation',
        'animation/state',
        'animation/seasonal',
        'mascot/state',
        'mascot/control',
        'mascot/speak',
        'mascot/business-advice',
        'mascot/react-whats-new',
        'mascot/holiday-theme',
        'mascot/reset',
        'code/stage',
        'code/stage-batch',
        'code/pending',
        'code/approve',
        'code/reject',
        'code/apply',
        'code/rollback',
        'code/change/:id',
        'platform/scan-now',
        'platform/scan-history',
        'platform/changes',
      ],
      mascotState,
      userRole: req.platformRole,
      animationState: animationControlService.getState(),
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/test/platform-downtime-countdown
 * Send a test platform downtime notification with 30-second countdown simulation via HelpAI
 * This broadcasts live countdown updates to all connected clients
 */
supportCommandRouter.post('/test/platform-downtime-countdown', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Identify the sender - HelpAI bot or support staff
    const senderName = req.user?.email?.includes('helpai') || req.platformRole === 'Bot' ? 'HelpAI' : 'Support';
    
    // Send initial system message about platform going down
    broadcastForceRefresh('system_message', {
      action: 'platform_downtime_alert',
      message: 'Platform maintenance in progress. System will be down for updates.',
      severity: 'error',
      duration: 35000,
      dismissible: false,
      countdown: 30,
      timestamp: new Date().toISOString(),
      sender: senderName,
      senderBrand: 'HelpAI',
    });

    // Get all users and create notifications
    let allUsers: Array<{id: string; currentWorkspace: string | null}> = [];
    try {
      allUsers = await db.select({ 
        id: users.id, 
        currentWorkspace: users.currentWorkspace 
      }).from(users);
    } catch (error) {
      log.warn('[TestCountdown] Could not fetch users:', error);
      allUsers = [];
    }

    // Create system notification for each user
    if (allUsers.length > 0) {
      const notificationInserts = allUsers.map(user => ({
        workspaceId: user.currentWorkspace || PLATFORM_WORKSPACE_ID,
        userId: user.id,
        type: 'system' as const,
        title: '🤖 HelpAI System Alert - Platform Maintenance',
        message: `${PLATFORM.name} platform is going down for maintenance. Countdown: 30 seconds`,
        isRead: false,
        actionUrl: '/dashboard' as string,
        metadata: { 
          testCountdown: true, 
          pushedBy: req.user?.id,
          countdownSeconds: 30,
          sender: senderName,
          brand: 'HelpAI',
        },
      }));
      
      // Insert all notifications at once
      try {
        await db.insert(notifications).values(notificationInserts);
      } catch (insertError) {
        log.error('[TestCountdown] Notification insert failed:', insertError);
      }
    }

    // Broadcast force refresh for notifications
    broadcastForceRefresh('notifications', {
      action: 'platform_downtime',
      count: allUsers.length,
      sender: 'HelpAI',
    });

    // Start the countdown simulation - send updates every second for 30 seconds
    let secondsRemaining = 30;
    const countdownInterval = setInterval(async () => {
      secondsRemaining--;
      
      broadcastForceRefresh('system_message', {
        action: 'countdown_update',
        message: `Platform going down in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}...`,
        severity: 'error',
        countdown: secondsRemaining,
        timestamp: new Date().toISOString(),
        sender: 'HelpAI',
        senderBrand: 'HelpAI',
      });

      log.info(`[HelpAI Maintenance] Seconds remaining: ${secondsRemaining}`);

      if (secondsRemaining <= 0) {
        clearInterval(countdownInterval);
        
        // Final message - platform is down
        broadcastForceRefresh('system_message', {
          action: 'platform_down',
          message: 'Platform is now down for maintenance',
          severity: 'error',
          duration: 0,
          dismissible: false,
          timestamp: new Date().toISOString(),
          sender: 'HelpAI',
          senderBrand: 'HelpAI',
        });

        log.info('[HelpAI Maintenance] Countdown complete - platform down');
      }
    }, 1000);

    await logSupportAction(req.user?.id || 'unknown', 'test_platform_downtime_countdown', {
      totalUsers: allUsers.length,
      countdownSeconds: 30,
      testType: 'simulation',
    });

    res.json({
      success: true,
      message: 'Platform downtime countdown test started',
      notificationsCreated: allUsers.length,
      countdownSeconds: 30,
      startTime: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] Platform downtime countdown test error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Log support staff actions for audit trail
 */
async function logSupportAction(userId: string, action: string, details: Record<string, any>) {
  try {
    await db.insert(systemAuditLogs).values({
      workspaceId: 'system',
      userId,
      action: `support_console_${action}`,
      entityType: 'support_command',
      entityId: action,
      changes: details,
      metadata: { 
        console: 'support_command_console',
        timestamp: new Date().toISOString(),
      },
      ipAddress: 'system-support-console',
    });
  } catch (error) {
    log.error('[SupportConsole] Audit log failed:', error);
  }
}

// =============================================================================
// PLATFORM MAINTENANCE MODE ENDPOINTS
// =============================================================================

import { platformMaintenanceService, HELPAI_MAINTENANCE_COMMANDS } from '../services/platformMaintenanceService';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('SupportCommandConsole');


/**
 * GET /api/support/command/maintenance/status
 * Get current maintenance mode status
 */
supportCommandRouter.get('/maintenance/status', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  const status = platformMaintenanceService.getStatus();
  res.json({ success: true, ...status });
});

/**
 * POST /api/support/command/maintenance/activate
 * Activate maintenance mode - locks platform for end users
 */
supportCommandRouter.post('/maintenance/activate', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason, estimatedMinutes } = req.body;
    const userId = req.user?.id || 'support_console';
    
    const result = await platformMaintenanceService.activateMaintenance(
      userId,
      reason || 'Scheduled maintenance',
      estimatedMinutes
    );
    
    await logSupportAction(userId, 'maintenance_activate', {
      reason,
      estimatedMinutes,
      success: result.success,
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Maintenance activate error:', error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/maintenance/deactivate
 * Deactivate maintenance mode - restores normal platform access
 */
supportCommandRouter.post('/maintenance/deactivate', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'support_console';
    
    const result = await platformMaintenanceService.deactivateMaintenance(userId);
    
    await logSupportAction(userId, 'maintenance_deactivate', {
      success: result.success,
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Maintenance deactivate error:', error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/broadcast
 * Send platform-wide broadcast announcement
 */
supportCommandRouter.post('/broadcast', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, message, priority } = req.body;
    const userId = req.user?.id || 'support_console';
    
    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    
    const result = await platformMaintenanceService.broadcastPlatformMessage(
      userId,
      title || 'Platform Announcement',
      message,
      priority || 'high'
    );
    
    await logSupportAction(userId, 'platform_broadcast', {
      title,
      message,
      priority,
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('[SupportConsole] Broadcast error:', error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});

/**
 * POST /api/support/command/helpai/command
 * Execute HelpAI maintenance commands directly (for API access)
 * HelpAI uses this to bypass normal auth during maintenance
 */
supportCommandRouter.post('/helpai/command', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { command, args, userId, userRole, bypassToken } = req.body;
    
    // Validate HelpAI bypass token during maintenance
    const accessCheck = platformMaintenanceService.canAccess(
      userId || 'helpai',
      userRole || 'bot',
      undefined,
      bypassToken
    );
    
    if (!accessCheck.allowed && !bypassToken) {
      // Generate bypass for HelpAI
      const newToken = platformMaintenanceService.generateBypassToken('helpai');
      return res.json({
        success: true,
        bypassToken: newToken,
        message: 'Bypass token generated for HelpAI',
      });
    }
    
    // Execute the command
    const cmdHandler = HELPAI_MAINTENANCE_COMMANDS[command as keyof typeof HELPAI_MAINTENANCE_COMMANDS];
    if (!cmdHandler) {
      return res.status(404).json({ success: false, message: `Unknown command: ${command}` });
    }
    
    const result = await cmdHandler.execute(args || [], userId || 'helpai', userRole || 'bot');
    
    res.json({
      success: true,
      response: result,
      bypassToken: bypassToken,
    });
  } catch (error: unknown) {
    log.error('[SupportConsole] HelpAI command error:', error);
    res.status(500).json({ success: false, message: sanitizeError(error) });
  }
});
