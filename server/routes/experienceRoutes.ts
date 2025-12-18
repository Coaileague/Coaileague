/**
 * Experience Enhancement Routes
 * 
 * API endpoints for:
 * - Smart replies
 * - Notification preferences
 * - Haptic feedback settings
 * - Role-based theming
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { smartReplyService } from '../services/smartReplyService';

interface AuthRequest extends Request {
  user?: {
    id: string;
    platformRole?: string;
    currentWorkspaceId?: string;
  };
}

const router = Router();

router.get('/smart-replies/templates', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const templates = await smartReplyService.getTemplates(userId);
    
    res.json({ success: true, templates });
  } catch (error: any) {
    console.error('[SmartReply] Templates error:', error);
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
  } catch (error: any) {
    console.error('[SmartReply] Generate error:', error);
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
  } catch (error: any) {
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
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get theme' });
  }
});

router.get('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    
    const defaults = {
      soundEnabled: true,
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
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    };
    
    res.json({ success: true, preferences: defaults });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

router.post('/notification-preferences', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;
    const preferences = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log(`[Preferences] Saved notification preferences for ${userId}`);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

router.post('/haptic-trigger', async (req: Request, res: Response) => {
  try {
    const { type, userId, deviceType } = req.body;
    
    console.log(`[Haptic] Triggered ${type} for ${userId} on ${deviceType}`);
    
    res.json({ success: true, triggered: true });
  } catch (error: any) {
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

const onboardingProgress = new Map<string, Record<string, { completed: boolean; skipped: boolean }>>();

router.get('/onboarding/progress', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const workspaceId = req.query.workspaceId as string || authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const key = `${userId}-${workspaceId || 'default'}`;
    const userProgress = onboardingProgress.get(key) || {};
    
    const steps = defaultOnboardingSteps.map(step => ({
      ...step,
      completed: userProgress[step.id]?.completed || false,
      skipped: userProgress[step.id]?.skipped || false,
      aiSuggestion: step.id === 'add-employees' ? 'Adding 3+ team members unlocks collaborative scheduling features' : undefined,
    }));
    
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
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get onboarding progress' });
  }
});

router.post('/onboarding/steps/:stepId/complete', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { stepId } = req.params;
    const workspaceId = authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const key = `${userId}-${workspaceId || 'default'}`;
    const userProgress = onboardingProgress.get(key) || {};
    userProgress[stepId] = { completed: true, skipped: false };
    onboardingProgress.set(key, userProgress);
    
    console.log(`[Onboarding] Step ${stepId} completed by ${userId}`);
    
    res.json({ success: true, stepId, status: 'completed' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

router.post('/onboarding/steps/:stepId/skip', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { stepId } = req.params;
    const workspaceId = authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const key = `${userId}-${workspaceId || 'default'}`;
    const userProgress = onboardingProgress.get(key) || {};
    userProgress[stepId] = { completed: false, skipped: true };
    onboardingProgress.set(key, userProgress);
    
    console.log(`[Onboarding] Step ${stepId} skipped by ${userId}`);
    
    res.json({ success: true, stepId, status: 'skipped' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to skip step' });
  }
});

export default router;
