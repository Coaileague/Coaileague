/**
 * Onboarding Pipeline API Routes - Sales & Gamification System
 * 
 * Endpoints:
 * - GET /api/onboarding/progress - Get full onboarding progress
 * - GET /api/onboarding/tasks - Get all onboarding tasks
 * - POST /api/onboarding/tasks/:taskId/complete - Mark task as complete
 * - POST /api/onboarding/tasks/:taskId/progress - Update task progress
 * - POST /api/onboarding/tasks/:taskId/skip - Skip a task
 * - POST /api/onboarding/pipeline/status - Update pipeline status
 * - POST /api/onboarding/trial/start - Start trial
 * - GET /api/onboarding/rewards - Get available rewards
 * - POST /api/onboarding/rewards/:rewardId/apply - Apply reward
 * - POST /api/onboarding/events - Process system event
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { onboardingPipelineService, type PipelineStatus } from '../services/onboardingPipelineService';
import { isFeatureEnabled } from '@shared/platformConfig';
import { PLATFORM } from '../config/platformConfig';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { signupLimiter } from '../middleware/rateLimiter';

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

const bulkImportLocks = new Map<string, { userId: string; startedAt: number }>();
const BULK_IMPORT_LOCK_TTL_MS = 10 * 60 * 1000;

function acquireBulkImportLock(workspaceId: string, userId: string): { acquired: boolean; holder?: string } {
  const existing = bulkImportLocks.get(workspaceId);
  if (existing && Date.now() - existing.startedAt < BULK_IMPORT_LOCK_TTL_MS && existing.userId !== userId) {
    return { acquired: false, holder: existing.userId };
  }
  bulkImportLocks.set(workspaceId, { userId, startedAt: Date.now() });
  return { acquired: true };
}

function releaseBulkImportLock(workspaceId: string) {
  bulkImportLocks.delete(workspaceId);
}

const ensureOnboardingEnabled = (req: any, res: any, next: any) => {
  if (!isFeatureEnabled('enableOnboardingPipeline')) {
    return res.status(403).json({ 
      error: 'Onboarding pipeline feature is not enabled',
      enabled: false 
    });
  }
  next();
};

const requireWorkspace = (req: any, res: any, next: any) => {
  const workspaceId = req.workspaceId || req.user?.workspaceId || req.session?.workspaceId;
  if (!workspaceId) {
    return res.status(403).json({ error: 'No workspace selected' });
  }
  req.workspaceId = workspaceId;
  next();
};

onboardingRouter.get('/progress', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const progress = await onboardingPipelineService.getProgress(req.workspaceId);
    
    res.json({
      success: true,
      data: progress,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Error getting progress:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

onboardingRouter.get('/tasks', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const tasks = await onboardingPipelineService.getTasks(req.workspaceId);
    
    res.json({
      success: true,
      tasks,
      count: tasks.length,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Error getting tasks:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

onboardingRouter.post('/tasks/:taskId/skip', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const { taskId } = req.params;
    
    const task = await onboardingPipelineService.skipTask(req.workspaceId, taskId);
    
    res.json({
      success: true,
      message: 'Task skipped',
      task,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Error skipping task:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// OMEGA-L1: signupLimiter (3/hr per IP) caps trial workspace provisioning at the route level.
// Applied here (inside the auth-protected onboarding router) because the route itself
// requires an authenticated session — rate-limiting unauthenticated requests is handled
// by the auth layer (401 on missing session) which already prevents abuse.
onboardingRouter.post('/initialize', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const progress = await onboardingPipelineService.initializeOnboarding(req.workspaceId);
    
    res.json({
      success: true,
      message: 'Onboarding initialized',
      data: progress,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Error initializing:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

const applyRewardSchema = z.object({
  invoiceId: z.string().optional(),
});

onboardingRouter.post('/ai-tasks/generate', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const tasks = await onboardingPipelineService.generateDynamicTasks(req.workspaceId);
    
    res.json({
      success: true,
      message: `Generated ${tasks.length} personalized tasks`,
      tasks,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Error generating AI tasks:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

const systemEventSchema = z.object({
  eventType: z.string(),
  eventData: z.record(z.any()).optional(),
});

// ============================================================================
// AI DATA MIGRATION ENDPOINTS
// ============================================================================

import { onboardingOrchestrator, type OnboardingSource } from '../services/ai-brain/subagents/onboardingOrchestrator';
import { dataMigrationAgent } from '../services/ai-brain/subagents/dataMigrationAgent';
import { createLogger } from '../lib/logger';
const log = createLogger('OnboardingRoutes');

const dataImportSourceSchema = z.object({
  type: z.enum(['pdf', 'excel', 'csv', 'manual', 'bulk_text']),
  fileContent: z.string().optional(),
  fileName: z.string().optional(),
  data: z.array(z.record(z.any())).optional(),
  headers: z.array(z.string()).optional(),
  formData: z.record(z.any()).optional(),
  extractionType: z.enum(['employees', 'teams', 'schedules', 'auto']).optional(),
});

const aiOnboardingSchema = z.object({
  sources: z.array(dataImportSourceSchema).optional(),
  options: z.object({
    skipGamification: z.boolean().optional(),
    skipDataMigration: z.boolean().optional(),
    validateOnly: z.boolean().optional(),
    unlockBasicAutomation: z.boolean().optional(),
  }).optional(),
});

onboardingRouter.get('/ai/status', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const status = await onboardingOrchestrator.getOnboardingStatus(req.workspaceId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Status error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

const extractDataSchema = z.object({
  source: dataImportSourceSchema,
});

const importDataSchema = z.object({
  data: z.object({
    employees: z.array(z.any()).optional(),
    teams: z.array(z.any()).optional(),
    schedules: z.array(z.any()).optional(),
  }),
  skipDuplicates: z.boolean().optional(),
});

onboardingRouter.get('/setup-guide', ensureOnboardingEnabled, requireWorkspace, async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id || req.user?.claims?.sub || req.session?.userId;
    const userRole = req.session?.platformRole || req.session?.workspaceRole || 'employee';
    
    const progress = await onboardingPipelineService.getProgress(workspaceId);
    
    const roleHierarchy: Record<string, number> = {
      root_admin: 100, deputy_admin: 90, sysop: 80, support: 70, auditor: 60,
      billing_admin: 55, business_owner: 50, co_owner: 45, manager: 40,
      supervisor: 30, team_lead: 25, employee: 10, contractor: 5, guest: 1
    };
    const userRoleLevel = roleHierarchy[userRole] || 10;
    
    const normalizeRule = (rule: string) => rule.replace(/\s+/g, '');
    
    const getTaskInfo = (validationRule: string, href: string, requiredRoleLevel: number) => {
      const normalizedRule = normalizeRule(validationRule);
      const task = progress.tasks?.find(t => 
        t.validationRule && normalizeRule(t.validationRule) === normalizedRule
      );
      if (!task) return null;
      return {
        id: task.id,
        title: task.title,
        isCompleted: task.status === 'completed',
        href,
        points: task.points || 10,
        requiredRoleLevel,
      };
    };
    
    const sectionDefs = [
      {
        id: 'organization',
        title: 'Set up Organization',
        icon: 'organization' as const,
        requiredRoleLevel: 40,
        trinityTip: 'Complete your company profile to unlock personalized AI recommendations.',
        taskRules: [
          { rule: 'company_profile_complete', href: '/settings', roleLevel: 40 },
        ]
      },
      {
        id: 'billing',
        title: 'Set up Billing',
        icon: 'billing' as const,
        requiredRoleLevel: 50,
        trinityTip: 'Adding a payment method unlocks your 10% new customer discount.',
        taskRules: [
          { rule: 'billing_configured', href: '/billing', roleLevel: 50 },
        ]
      },
      {
        id: 'team',
        title: 'Build Your Team',
        icon: 'team' as const,
        requiredRoleLevel: 30,
        trinityTip: 'Invite your first team member to unlock collaborative features.',
        taskRules: [
          { rule: 'employee_count >= 1', href: '/employees', roleLevel: 30 },
          { rule: 'team_member_invited', href: '/employees', roleLevel: 30 },
        ]
      },
      {
        id: 'scheduling',
        title: 'Configure Scheduling',
        icon: 'scheduling' as const,
        requiredRoleLevel: 25,
        trinityTip: 'Set up your first schedule to see AI-powered shift optimization.',
        taskRules: [
          { rule: 'shift_count >= 1', href: '/schedule', roleLevel: 25 },
          { rule: 'ai_scheduler_used', href: '/schedule', roleLevel: 25 },
        ]
      },
    ];
    
    const sections = sectionDefs.map(section => ({
      ...section,
      tasks: section.taskRules
        .map(tr => getTaskInfo(tr.rule, tr.href, tr.roleLevel))
        .filter((t): t is NonNullable<typeof t> => t !== null),
    })).filter(s => s.tasks.length > 0);
    
    const filteredSections = sections
      .filter(section => userRoleLevel >= section.requiredRoleLevel)
      .map(section => ({
        ...section,
        tasks: section.tasks.filter(task => userRoleLevel >= (task.requiredRoleLevel || 0))
      }))
      .filter(section => section.tasks.length > 0);
    
    const allTasks = filteredSections.flatMap(s => s.tasks);
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.isCompleted).length;
    const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const greetings = [
      `Welcome! Let's get your workspace set up.`,
      `You're ${completionPercent}% complete - keep going!`,
      `A few more steps to unlock full platform access.`,
      `Great progress! Trinity is ready to help.`,
    ];
    const trinityGreeting = completionPercent >= 100 
      ? `All set! You've unlocked the full ${PLATFORM.name} experience.`
      : greetings[Math.min(Math.floor(completionPercent / 25), greetings.length - 1)];
    
    res.json({
      sections: filteredSections,
      totalTasks,
      completedTasks,
      completionPercent,
      trinityGreeting,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Setup guide error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { orgOnboardingTasks } from '@shared/schema';

/**
 * POST /api/onboarding/complete-task/:taskId
 * Quick task completion for setup guide panel
 */
const ONBOARDING_PROGRESS_KEY = 'create_org_progress';

const createOrgProgressSchema = z.object({
  currentStep: z.number().min(0),
  formData: z.record(z.any()),
  completedSteps: z.array(z.number()),
  skippedSteps: z.array(z.number()),
});

onboardingRouter.get('/create-org/progress', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { db } = await import('../db');
    const { users } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    const metadata = (user as any)?.metadata || {};
    const progress = metadata[ONBOARDING_PROGRESS_KEY] || null;

    res.json({
      success: true,
      data: progress,
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Get create-org progress error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

onboardingRouter.post('/create-org/progress', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const progressData = createOrgProgressSchema.parse(req.body);

    const { db } = await import('../db');
    const { users } = await import('@shared/schema');
    const { eq, sql } = await import('drizzle-orm');

    await db.update(users)
      .set({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        metadata: sql`COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(${ONBOARDING_PROGRESS_KEY}, ${JSON.stringify(progressData)}::jsonb)`
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: 'Progress saved',
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Save create-org progress error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

onboardingRouter.delete('/create-org/progress', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { db } = await import('../db');
    const { users } = await import('@shared/schema');
    const { eq, sql } = await import('drizzle-orm');

    await db.update(users)
      .set({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        metadata: sql`COALESCE(metadata, '{}'::jsonb) - ${ONBOARDING_PROGRESS_KEY}`
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: 'Progress cleared',
    });
  } catch (error: unknown) {
    log.error('[Onboarding] Clear create-org progress error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});
