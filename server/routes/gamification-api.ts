import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, type AuthenticatedRequest } from '../rbac';
import { gamificationService } from '../services/gamification/gamificationService';
import { db } from '../db';
import {
  employees,
  achievements
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { isFeatureEnabled } from '@shared/platformConfig';
import '../types';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('GamificationApi');


export const gamificationRouter = Router();

// Feature flag check
gamificationRouter.use((req, res, next) => {
  if (!isFeatureEnabled('enableGamification')) {
    return res.status(503).json({
      error: 'Gamification system is currently disabled',
      feature: 'enableGamification'
    });
  }
  next();
});

// Apply auth to all routes
gamificationRouter.use(requireAuth);

// ============================================================================
// EMPLOYEE ENDPOINTS
// ============================================================================

/**
 * GET /api/gamification/profile - Get current employee's gamification profile
 */
gamificationRouter.get('/profile', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Get employee record
    const [employee] = await db.select()
      .from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Get or create points record
    const points = await gamificationService.getOrCreateEmployeePoints(
      user.currentWorkspaceId,
      employee.id
    );

    // Get achievements
    const earnedAchievements = await gamificationService.getEmployeeAchievements(
      user.currentWorkspaceId,
      employee.id
    );

    res.json({
      profile: {
        employeeId: employee.id,
        name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
        totalPoints: points.totalPoints || 0,
        level: points.currentLevel || 1,
        currentStreak: points.currentStreak || 0,
        longestStreak: points.longestStreak || 0,
        achievementsEarned: points.achievementsEarned || 0,
        pointsThisWeek: points.pointsThisWeek || 0,
        pointsThisMonth: points.pointsThisMonth || 0,
      },
      achievements: earnedAchievements,
    });
  } catch (error) {
    log.error('Error fetching gamification profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/gamification/achievements - Get all available achievements
 */
gamificationRouter.get('/achievements', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId || PLATFORM_WORKSPACE_ID;
    if (!workspaceId) {
      return res.json({ achievements: [] });
    }

    // Initialize workspace if needed
    await gamificationService.initializeWorkspace(workspaceId);

    const allAchievements = await gamificationService.getWorkspaceAchievements(
      workspaceId
    );

    // Get employee's earned achievements
    const [employee] = await db.select()
      .from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    let earnedIds: Set<string> = new Set();
    if (employee) {
      const earned = await gamificationService.getEmployeeAchievements(
        workspaceId,
        employee.id
      );
      earnedIds = new Set(earned.map(e => e.achievementId));
    }

    const achievementsWithStatus = allAchievements.map(a => ({
      ...a,
      earned: earnedIds.has(a.id),
    }));

    res.json({ achievements: achievementsWithStatus });
  } catch (error) {
    log.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * GET /api/gamification/leaderboard - Get workspace leaderboard
 */
gamificationRouter.get('/leaderboard', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId || PLATFORM_WORKSPACE_ID;
    if (!workspaceId) {
      return res.json({ leaderboard: [], period: 'all_time', generatedAt: new Date() });
    }

    const { period = 'all_time', limit = '10' } = req.query;
    const validPeriods = ['weekly', 'monthly', 'all_time'] as const;
    const periodValue = validPeriods.includes(period as any) 
      ? (period as 'weekly' | 'monthly' | 'all_time')
      : 'all_time';

    const leaderboard = await gamificationService.getLeaderboard(
      workspaceId,
      periodValue,
      Math.min(Math.max(1, parseInt(limit as string) || 10), 100)
    );

    res.json({ 
      leaderboard,
      period: periodValue,
      generatedAt: new Date(),
    });
  } catch (error) {
    log.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * POST /api/gamification/achievements - Create a new achievement (admin only)
 */
gamificationRouter.post('/achievements', requireWorkspaceRole(['org_owner', 'co_owner']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      category: z.enum(['attendance', 'performance', 'teamwork', 'learning', 'milestone', 'special']).optional(),
      icon: z.string().optional(),
      pointsValue: z.number().min(0).max(10000).optional(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
      triggerType: z.string().optional(),
      triggerThreshold: z.number().optional(),
    });

    const validated = schema.parse(req.body);

    const [achievement] = await db.insert(achievements).values({
      workspaceId: user.currentWorkspaceId,
      ...validated,
      isActive: true,
    }).returning();

    res.status(201).json({ achievement });
  } catch (error: unknown) {
    log.error('Error creating achievement:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to create achievement' });
  }
});

/**
 * POST /api/gamification/award - Manually award points or achievement to employee
 */
gamificationRouter.post('/award', requireWorkspaceRole(['org_owner', 'co_owner', 'department_manager']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const schema = z.object({
      employeeId: z.string(),
      type: z.enum(['points', 'achievement']),
      points: z.number().min(1).max(10000).optional(),
      achievementId: z.string().optional(),
      reason: z.string().optional(),
    });

    const validated = schema.parse(req.body);

    if (validated.type === 'points' && validated.points) {
      const result = await gamificationService.awardPoints({
        workspaceId: user.currentWorkspaceId,
        employeeId: validated.employeeId,
        points: validated.points,
        transactionType: 'manual',
        description: validated.reason || 'Manual points award',
        awardedBy: user.id,
      });

      res.json({
        success: true,
        type: 'points',
        points: validated.points,
        newTotal: result.newTotal,
        levelUp: result.levelUp,
        newLevel: result.newLevel,
      });
    } else if (validated.type === 'achievement' && validated.achievementId) {
      const result = await gamificationService.awardAchievement({
        workspaceId: user.currentWorkspaceId,
        employeeId: validated.employeeId,
        achievementId: validated.achievementId,
        reason: validated.reason,
      });

      if (!result) {
        return res.status(400).json({ error: 'Achievement already earned or not found' });
      }

      res.json({
        success: true,
        type: 'achievement',
        achievement: result.achievement,
        pointsAwarded: result.points,
      });
    } else {
      res.status(400).json({ error: 'Invalid award type or missing required fields' });
    }
  } catch (error: unknown) {
    log.error('Error awarding:', error);
    res.status(400).json({ error: sanitizeError(error) || 'Failed to award' });
  }
});

/**
 * GET /api/gamification/employees/:id - Get specific employee's gamification data (admin)
 */
gamificationRouter.get('/employees/:id', requireWorkspaceRole(['org_owner', 'co_owner', 'department_manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { id } = req.params;

    // Get employee
    const [employee] = await db.select()
      .from(employees)
      .where(and(
        eq(employees.id, id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const points = await gamificationService.getOrCreateEmployeePoints(
      user.currentWorkspaceId,
      id
    );

    const earnedAchievements = await gamificationService.getEmployeeAchievements(
      user.currentWorkspaceId,
      id
    );

    res.json({
      employee: {
        id: employee.id,
        name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
        email: employee.email,
      },
      points: {
        total: points.totalPoints || 0,
        level: points.currentLevel || 1,
        streak: points.currentStreak || 0,
        longestStreak: points.longestStreak || 0,
        thisWeek: points.pointsThisWeek || 0,
        thisMonth: points.pointsThisMonth || 0,
        achievementsEarned: points.achievementsEarned || 0,
      },
      achievements: earnedAchievements,
    });
  } catch (error) {
    log.error('Error fetching employee gamification:', error);
    res.status(500).json({ error: 'Failed to fetch employee data' });
  }
});

/**
 * GET /api/gamification/feed - Get recent recognition feed
 */
gamificationRouter.get('/feed', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId || PLATFORM_WORKSPACE_ID;
    if (!workspaceId) {
      return res.json({ feed: [] });
    }

    const { limit = '20' } = req.query;
    const feed = await gamificationService.getRecognitionFeed(
      workspaceId,
      Math.min(Math.max(1, parseInt(limit as string) || 20), 100)
    );

    res.json({ feed });
  } catch (error) {
    log.error('Error fetching recognition feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

/**
 * POST /api/gamification/initialize - Initialize gamification for workspace
 */
gamificationRouter.post('/initialize', requireWorkspaceRole(['org_owner', 'co_owner']), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    await gamificationService.initializeWorkspace(user.currentWorkspaceId);

    res.json({ success: true, message: 'Gamification initialized with default achievements' });
  } catch (error) {
    log.error('Error initializing gamification:', error);
    res.status(500).json({ error: 'Failed to initialize gamification' });
  }
});
