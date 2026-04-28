/**
 * Experience Enhancement Routes
 * 
 * API endpoints for:
 * - Smart replies
 * - Notification preferences (with database persistence)
 * - Haptic feedback settings
 * - Role-based theming
 * - Onboarding progress (with live sync)
 * - AI Brain live events
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { smartReplyService } from '../services/smartReplyService';
import { db } from '../db';
import { 
  userNotificationPreferences,
  aiBrainLiveEvents,
  interactiveOnboardingState
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { normalizeAiBrainActorType } from '../constants/enumTypes';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('ExperienceRoutes');


// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthRequest extends Request {
  user?: {
    id: string;
    platformRole?: string;
    currentWorkspaceId?: string;
  };
}

// WebSocket broadcaster - will be set by routes.ts
let wsBroadcaster: ((event: string, data: any, workspaceId?: string) => void) | null = null;

export function setWebSocketBroadcaster(broadcaster: (event: string, data: any, workspaceId?: string) => void) {
  wsBroadcaster = broadcaster;
}

function broadcastToClients(event: string, data: any, workspaceId?: string) {
  if (wsBroadcaster) {
    wsBroadcaster(event, data, workspaceId);
  }
}

const router = Router();

router.use(requireAuth);

router.get('/smart-replies/templates', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const templates = await smartReplyService.getTemplates(userId);
    
    res.json({ success: true, templates });
  } catch (error: unknown) {
    log.error('[SmartReply] Templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

router.post('/smart-replies/generate', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const { message, context, mode } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }
    
    const enrichedContext = {
      ...context,
      userId,
      workspaceId: authReq.user?.currentWorkspaceId,
    };
    
    if (mode === 'single') {
      const reply = await smartReplyService.generateSingleReply(message, enrichedContext);
      res.json({ success: true, reply });
    } else {
      const suggestions = await smartReplyService.generateSuggestions(message, enrichedContext);
      res.json({ success: true, suggestions });
    }
  } catch (error: unknown) {
    log.error('[SmartReply] Generate error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

router.post('/smart-replies/usage', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const { replyId, category, context } = req.body;
    
    if (userId && replyId) {
      await smartReplyService.recordUsage(replyId, category, userId, context);
    }
    
    res.json({ success: true });
  } catch (error: unknown) {
    res.json({ success: true });
  }
});

router.get('/role-theme/:role', async (req: Request, res: Response) => {
  try {
    const { role } = req.params;
    
    const themes: Record<string, any> = {
      root_admin: {
        name: 'Executive',
        gradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
        primary: 'hsl(262, 83%, 58%)',
      },
      deputy_admin: {
        name: 'Command',
        gradient: 'from-blue-600 via-sky-500 to-cyan-500',
        primary: 'hsl(220, 90%, 56%)',
      },
      sysop: {
        name: 'Systems',
        gradient: 'from-green-600 via-emerald-500 to-teal-500',
        primary: 'hsl(142, 76%, 36%)',
      },
      support_manager: {
        name: 'Support Lead',
        gradient: 'from-orange-600 via-amber-500 to-yellow-500',
        primary: 'hsl(25, 95%, 53%)',
      },
      default: {
        name: 'Standard',
        gradient: 'from-slate-600 via-gray-500 to-zinc-500',
        primary: 'hsl(215, 25%, 45%)',
      },
    };
    
    const theme = themes[role] || themes.default;
    
    res.json({ success: true, theme });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

// In-memory storage for notification preferences (fallback when DB unavailable)
const notificationPrefsMemory = new Map<string, any>();

router.get('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const workspaceId = (authReq as any).workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId || 'global';
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Try to get from database with workspace scoping
    let dbPrefs = null;
    try {
      const results = await db.select()
        .from(userNotificationPreferences)
        .where(
          and(
            eq(userNotificationPreferences.userId, userId),
            eq(userNotificationPreferences.workspaceId, workspaceId)
          )
        )
        .limit(1);
      dbPrefs = results[0];
    } catch (e) {
      // Table may not exist yet - check in-memory fallback
      const memKey = `${userId}-${workspaceId}`;
      dbPrefs = notificationPrefsMemory.get(memKey);
    }
    
    const defaults = {
      soundEnabled: dbPrefs?.enablePush ?? true,
      vibrationEnabled: true,
      volume: 0.7,
      sounds: {
        message: 'bubble',
        alert: 'urgent',
        approval: 'chime',
        reminder: 'gentle',
        trinity: 'trinity',
        critical: 'urgent',
      },
      vibrations: {
        message: 'short',
        alert: 'double',
        approval: 'short',
        reminder: 'short',
        trinity: 'pulse',
        critical: 'urgent',
      },
      quietHoursEnabled: dbPrefs?.quietHoursStart != null,
      quietHoursStart: dbPrefs?.quietHoursStart ? `${dbPrefs.quietHoursStart}:00` : '22:00',
      quietHoursEnd: dbPrefs?.quietHoursEnd ? `${dbPrefs.quietHoursEnd}:00` : '07:00',
    };
    
    res.json({ success: true, preferences: defaults });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

router.post('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const workspaceId = (authReq as any).workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId || 'global';
    const preferences = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const memKey = `${userId}-${workspaceId}`;
    const prefsData = {
      enablePush: preferences.soundEnabled ?? true,
      quietHoursStart: preferences.quietHoursEnabled ? parseInt(preferences.quietHoursStart?.split(':')[0] || '22') : null,
      quietHoursEnd: preferences.quietHoursEnabled ? parseInt(preferences.quietHoursEnd?.split(':')[0] || '7') : null,
    };
    
    // Always update in-memory fallback
    notificationPrefsMemory.set(memKey, prefsData);
    
    // Try to persist to database with composite key
    try {
      await db.insert(userNotificationPreferences)
        .values({
          userId,
          workspaceId,
          ...prefsData,
        })
        .onConflictDoUpdate({
          target: [userNotificationPreferences.userId, userNotificationPreferences.workspaceId],
          set: {
            ...prefsData,
            updatedAt: new Date(),
          }
        });
    } catch (e) {
      log.warn('[ExperienceRoutes] Failed to persist preference:', e);
    }
    
    // Broadcast preference change to all tabs/devices
    broadcastToClients('preferences:updated', {
      userId,
      workspaceId,
      preferences,
      timestamp: new Date().toISOString(),
    }, workspaceId !== 'global' ? workspaceId : undefined);
    
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

router.post('/haptic-trigger', async (req: Request, res: Response) => {
  try {
    const { type, userId, deviceType } = req.body;
    
    res.json({ success: true, triggered: true });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to trigger haptic' });
  }
});

const defaultOnboardingSteps = [
  { id: 'setup-profile', title: 'Complete Your Profile', description: 'Add your photo and contact details', icon: 'users', order: 1 },
  { id: 'add-employees', title: 'Add Team Members', description: 'Invite employees to your workspace', icon: 'users', order: 2 },
  { id: 'create-schedule', title: 'Create First Schedule', description: 'Set up your first weekly schedule', icon: 'calendar', order: 3 },
  { id: 'setup-payroll', title: 'Configure Payroll', description: 'Connect your payroll settings', icon: 'creditCard', order: 4 },
  { id: 'enable-notifications', title: 'Enable Notifications', description: 'Stay updated with alerts', icon: 'bell', order: 5 },
];

// In-memory fallback (used when DB tables not yet created)
const onboardingProgressMemory = new Map<string, Record<string, { completed: boolean; skipped: boolean }>>();

router.get('/onboarding/progress', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    // FIX: Never accept workspaceId from the query string — it would allow any authenticated
    // user to read onboarding progress for a workspace they don't belong to.
    // Always resolve workspace from the session only.
    const workspaceId = (authReq as any).workspaceId || authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Try to load from database first
    let dbStates: any[] = [];
    try {
      dbStates = await db.select()
        .from(interactiveOnboardingState)
        .where(
          workspaceId 
            ? and(eq(interactiveOnboardingState.userId, userId), eq(interactiveOnboardingState.workspaceId, workspaceId))
            : eq(interactiveOnboardingState.userId, userId)
        );
    } catch (e) {
      // Table doesn't exist - use in-memory fallback
    }
    
    const key = `${userId}-${workspaceId || 'default'}`;
    const memProgress = onboardingProgressMemory.get(key) || {};
    
    // Merge DB states with defaults
    const steps = defaultOnboardingSteps.map(step => {
      const dbState = dbStates.find(s => s.stepId === step.id);
      const memState = memProgress[step.id];
      
      return {
        ...step,
        completed: dbState?.completed ?? memState?.completed ?? false,
        skipped: dbState?.skipped ?? memState?.skipped ?? false,
        aiSuggestion: dbState?.aiSuggestion ?? (step.id === 'add-employees' ? 'Adding 3+ team members unlocks collaborative scheduling features' : undefined),
      };
    });
    
    const completedSteps = steps.filter(s => s.completed).length;
    const skippedSteps = steps.filter(s => s.skipped).length;
    const totalSteps = steps.length;
    const pendingSteps = totalSteps - completedSteps - skippedSteps;
    
    res.json({
      totalSteps,
      completedSteps,
      skippedSteps,
      percentComplete: Math.round((completedSteps / totalSteps) * 100),
      currentStep: steps.find(s => !s.completed && !s.skipped) || null,
      steps,
      isComplete: pendingSteps === 0,
      estimatedMinutesRemaining: pendingSteps * 3,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get onboarding progress' });
  }
});

router.post('/onboarding/steps/:stepId/complete', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { stepId } = req.params;
    const workspaceId = (authReq as any).workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Update in-memory fallback
    const key = `${userId}-${workspaceId || 'default'}`;
    const memProgress = onboardingProgressMemory.get(key) || {};
    memProgress[stepId] = { completed: true, skipped: false };
    onboardingProgressMemory.set(key, memProgress);
    
    // Try to persist to database
    try {
      await db.insert(interactiveOnboardingState)
        .values({
          userId,
          workspaceId: workspaceId || null,
          stepId,
          stepTitle: defaultOnboardingSteps.find(s => s.id === stepId)?.title,
          stepOrder: defaultOnboardingSteps.find(s => s.id === stepId)?.order || 0,
          completed: true,
          skipped: false,
          completedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [interactiveOnboardingState.userId, interactiveOnboardingState.workspaceId, interactiveOnboardingState.stepId],
          set: {
            completed: true,
            skipped: false,
            completedAt: new Date(),
            updatedAt: new Date(),
          }
        });
    } catch (e) {
      log.warn('[ExperienceRoutes] Failed to persist onboarding step:', e);
    }
    
    // Broadcast to all connected clients for live sync
    broadcastToClients('onboarding:step_completed', {
      userId,
      workspaceId,
      stepId,
      status: 'completed',
      timestamp: new Date().toISOString(),
    }, workspaceId || undefined);
    
    res.json({ success: true, stepId, status: 'completed' });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

router.post('/onboarding/steps/:stepId/skip', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { stepId } = req.params;
    const workspaceId = (authReq as any).workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Update in-memory fallback
    const key = `${userId}-${workspaceId || 'default'}`;
    const memProgress = onboardingProgressMemory.get(key) || {};
    memProgress[stepId] = { completed: false, skipped: true };
    onboardingProgressMemory.set(key, memProgress);
    
    // Try to persist to database
    try {
      await db.insert(interactiveOnboardingState)
        .values({
          userId,
          workspaceId: workspaceId || null,
          stepId,
          stepTitle: defaultOnboardingSteps.find(s => s.id === stepId)?.title,
          stepOrder: defaultOnboardingSteps.find(s => s.id === stepId)?.order || 0,
          completed: false,
          skipped: true,
          skippedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [interactiveOnboardingState.userId, interactiveOnboardingState.workspaceId, interactiveOnboardingState.stepId],
          set: {
            completed: false,
            skipped: true,
            skippedAt: new Date(),
            updatedAt: new Date(),
          }
        });
    } catch (e) {
      log.warn('[ExperienceRoutes] Failed to persist skipped step:', e);
    }
    
    // Broadcast to all connected clients
    broadcastToClients('onboarding:step_skipped', {
      userId,
      workspaceId,
      stepId,
      status: 'skipped',
      timestamp: new Date().toISOString(),
    }, workspaceId || undefined);
    
    res.json({ success: true, stepId, status: 'skipped' });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to skip step' });
  }
});

// ============================================================================
// AI BRAIN LIVE EVENTS - Real-time publishing for all users
// ============================================================================

router.post('/ai-brain/events', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const workspaceId = (authReq as any).workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    const { actorType, actionType, actionCategory, title, description, payload, metadata, severity, isGlobal, targetUserIds, targetRoles } = req.body;
    
    if (!actionType || !title) {
      return res.status(400).json({ error: 'actionType and title are required' });
    }
    
    const eventId = `event-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    
    // Try to persist to database
    let dbEventId = eventId;
    try {
      const [event] = await db.insert(aiBrainLiveEvents)
        .values({
          workspaceId: workspaceId || null,
          actorType: normalizeAiBrainActorType(actorType || 'system'),
          actorId: userId,
          actorName: authReq.user?.platformRole || 'User',
          actionType,
          actionCategory,
          title,
          description,
          payload,
          metadata,
          severity: severity || 'info',
          isGlobal: isGlobal ?? false,
          targetUserIds,
          targetRoles,
          broadcastedAt: new Date(),
        })
        .returning({ id: aiBrainLiveEvents.id });
      
      dbEventId = event.id;
    } catch (e) {
      log.warn('[ExperienceRoutes] Failed to persist live event:', e);
    }
    
    // Broadcast to all connected clients
    const eventData = {
      id: dbEventId,
      actorType: actorType || 'system',
      actorId: userId,
      actionType,
      actionCategory,
      title,
      description,
      payload,
      metadata,
      severity: severity || 'info',
      isGlobal: isGlobal ?? false,
      timestamp: new Date().toISOString(),
    };
    
    if (isGlobal) {
      // Broadcast to all workspaces
      broadcastToClients('ai_brain:live_event', eventData);
    } else {
      // Broadcast to specific workspace
      broadcastToClients('ai_brain:live_event', eventData, workspaceId || undefined);
    }
    
    res.json({ success: true, eventId: dbEventId });
  } catch (error: unknown) {
    log.error('[AIBrainEvents] Error:', error);
    res.status(500).json({ error: 'Failed to publish event' });
  }
});

router.get('/ai-brain/events', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const workspaceId = (authReq as any).workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    // Try to get from database - return workspace-scoped events OR global events
    let events: any[] = [];
    try {
      // Get global events
      const globalEvents = await db.select()
        .from(aiBrainLiveEvents)
        .where(eq(aiBrainLiveEvents.isGlobal, true))
        .orderBy(desc(aiBrainLiveEvents.createdAt))
        .limit(limit);
      
      // Get workspace-specific events if workspace is set
      let workspaceEvents: any[] = [];
      if (workspaceId) {
        workspaceEvents = await db.select()
          .from(aiBrainLiveEvents)
          .where(
            and(
              eq(aiBrainLiveEvents.workspaceId, workspaceId),
              eq(aiBrainLiveEvents.isGlobal, false)
            )
          )
          .orderBy(desc(aiBrainLiveEvents.createdAt))
          .limit(limit);
      }
      
      // Merge and sort by createdAt, limit total
      events = [...globalEvents, ...workspaceEvents]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    } catch (e) {
      log.warn('[ExperienceRoutes] Failed to fetch live events:', e);
    }
    
    res.json({ success: true, events });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get events' });
  }
});

export default router;
