import { Router, Request, Response } from "express";
import { requireAuth } from '../auth';
import { db } from "../db";
import { employees, users, timeEntries } from "@shared/schema";
import { eq, and, desc, sql, count, sum, gte } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('GamificationRoutes');


const router = Router();

// Get user's gamification stats
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Platform admins can view any workspace via query param, or their own if set
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const isPlatformAdmin = ['root_admin', 'deputy_admin', 'sysop'].includes(user?.platformRole);
    const queryWorkspaceId = req.query.workspaceId as string;
    const workspaceId = (isPlatformAdmin && queryWorkspaceId) || (req as any).workspaceId || (user as any)?.workspaceId;
    
    if (workspaceId && workspaceId !== (req as any).workspaceId && !isPlatformAdmin) {
      return res.status(403).json({ error: "Unauthorized workspace access" });
    }
    
    if (!workspaceId) {
      // For platform admins without a workspace context, return default gamification data
      if (isPlatformAdmin) {
        return res.json({
          points: 0,
          level: 1,
          streak: 0,
          rank: 0,
          totalUsers: 0,
          badges: [],
          totalHours: 0,
          message: 'No workspace context. Select a workspace to view gamification stats.'
        });
      }
      return res.status(403).json({ error: "Workspace context required" });
    }

    // Get employee record
    const employeeResult = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.userId, user.id),
          eq(employees.workspaceId, workspaceId)
        )
      )
      .limit(1);

    const employee = employeeResult[0];
    
    // Platform admin viewing another workspace without employee record
    if (!employee && isPlatformAdmin) {
      return res.json({
        points: 0,
        level: 1,
        streak: 0,
        rank: 0,
        totalUsers: 0,
        badges: [],
        totalHours: 0,
        message: 'Viewing workspace as platform admin. No personal gamification stats available.',
        viewingAsAdmin: true
      });
    }
    
    // Regular user without employee record
    if (!employee) {
      return res.json({
        points: 0,
        level: 1,
        streak: 0,
        rank: 0,
        totalUsers: 0,
        badges: [],
        totalHours: 0,
        message: 'No employee record found in this workspace.'
      });
    }

    // Calculate points based on activities
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentEntriesResult = await db
      .select({ 
        date: sql<string>`DATE(${timeEntries.clockIn})::text`,
        totalMinutes: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float) * 60), 0)`
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employee?.id || ''),
          gte(timeEntries.clockIn, weekAgo)
        )
      )
      .groupBy(sql`DATE(${timeEntries.clockIn})`)
      .orderBy(sql`DATE(${timeEntries.clockIn}) DESC`);

    // Calculate streak (consecutive days with time entries)
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      const hasEntry = recentEntriesResult.some(e => e.date === dateStr);
      if (hasEntry) {
        streak++;
      } else if (i > 0) {
        break; // Streak broken
      }
    }

    const totalHoursResult = await db
      .select({ totalHours: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)` })
      .from(timeEntries)
      .where(eq(timeEntries.employeeId, employee?.id || ''));

    const totalHours = Math.floor(parseFloat(String(totalHoursResult[0]?.totalHours || '0')));
    
    // Points calculation: 10 points per hour + streak bonuses
    const basePoints = totalHours * 10;
    const streakBonus = streak * 50;
    const points = basePoints + streakBonus;
    
    // Level calculation: every 500 points = 1 level
    const level = Math.floor(points / 500) + 1;

    const allEmployeesResult = await db
      .select({
        employeeId: timeEntries.employeeId,
        totalHoursSum: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)`
      })
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId))
      .groupBy(timeEntries.employeeId)
      .orderBy(sql`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0) DESC`);

    const rank = allEmployeesResult.findIndex(e => e.employeeId === employee?.id) + 1;
    const totalUsers = allEmployeesResult.length || 1;

    // Define badges
    const badges = [
      { 
        id: 'early-bird', 
        name: 'Early Bird', 
        icon: 'star', 
        earned: totalHours >= 40, 
        progress: Math.min(100, (totalHours / 40) * 100),
        description: 'Track 40+ hours total'
      },
      { 
        id: 'time-master', 
        name: 'Time Master', 
        icon: 'clock', 
        earned: totalHours >= 100, 
        progress: Math.min(100, (totalHours / 100) * 100),
        description: 'Track 100+ hours total'
      },
      { 
        id: 'team-player', 
        name: 'Team Player', 
        icon: 'users', 
        earned: false, 
        progress: 75,
        description: 'Help 10 coworkers with shifts'
      },
      { 
        id: 'perfect-week', 
        name: 'Perfect Week', 
        icon: 'trophy', 
        earned: streak >= 7, 
        progress: Math.min(100, (streak / 7) * 100),
        description: '7 day streak'
      },
    ];

    // Recent achievements
    const recentAchievements = [];
    if (streak >= 7) {
      recentAchievements.push({
        id: 'streak-7',
        title: '7 Day Streak!',
        earnedAt: 'Today',
        points: 100
      });
    }
    if (totalHours >= 100) {
      recentAchievements.push({
        id: 'hours-100',
        title: 'Completed 100 hours',
        earnedAt: 'Recently',
        points: 50
      });
    }

    res.json({
      points,
      level,
      streak,
      rank: rank || 1,
      totalUsers,
      badges,
      recentAchievements,
    });
  } catch (error) {
    log.error("[Gamification] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch gamification stats" });
  }
});

// Get leaderboard
router.get("/leaderboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id || !(user as any)?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const leaderboardResult = await db
      .select({
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        userId: employees.userId,
        totalHoursSum: sql<string>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0)`,
        recentHours: sql<string>`COALESCE(SUM(CASE WHEN ${(timeEntries as any).date} >= ${thirtyDaysAgo.toISOString()} THEN CAST(${timeEntries.totalHours} AS float) ELSE 0 END), 0)`,
        priorHours: sql<string>`COALESCE(SUM(CASE WHEN ${(timeEntries as any).date} >= ${sixtyDaysAgo.toISOString()} AND ${(timeEntries as any).date} < ${thirtyDaysAgo.toISOString()} THEN CAST(${timeEntries.totalHours} AS float) ELSE 0 END), 0)`,
      })
      .from(employees)
      .leftJoin(timeEntries, eq(employees.id, timeEntries.employeeId))
      .where(eq((employees as any).workspaceId, (user as any).workspaceId))
      .groupBy(employees.id, employees.firstName, employees.lastName, employees.userId)
      .orderBy(sql`COALESCE(SUM(CAST(${timeEntries.totalHours} AS float)), 0) DESC`)
      .limit(10);

    const users = leaderboardResult.map((entry, index) => {
      const totalHours = Math.floor(parseFloat(String(entry.totalHoursSum || '0')));
      const points = totalHours * 10;
      const recent = parseFloat(String(entry.recentHours || '0'));
      const prior = parseFloat(String(entry.priorHours || '0'));
      const trend = recent > prior ? 'up' : recent < prior ? 'down' : 'same';
      
      return {
        id: entry.employeeId,
        name: `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'Unknown',
        points,
        rank: index + 1,
        avatar: null,
        trend,
        isCurrentUser: entry.userId === user.id,
      };
    });

    res.json({ users });
  } catch (error) {
    log.error("[Gamification] Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Award points to user
router.post("/award-points", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { points, reason } = req.body;
    
    // Log the point award - in production, would persist to DB
    log.info(`[Gamification] Awarded ${points} points to user ${user.id}: ${reason}`);

    res.json({ success: true, message: `Awarded ${points} points` });
  } catch (error) {
    log.error("[Gamification] Error awarding points:", error);
    res.status(500).json({ error: "Failed to award points" });
  }
});

export default router;
