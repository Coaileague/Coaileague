import { Router, Request, Response } from "express";
import { db } from "../db";
import { employees, users, timeEntries } from "@shared/schema";
import { eq, and, desc, sql, count, sum, gte } from "drizzle-orm";

const router = Router();

// Get user's gamification stats
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Platform admins can view any workspace via query param, or their own if set
    const isPlatformAdmin = ['root_admin', 'super_admin', 'deputy_admin', 'sysop'].includes(user?.platformRole);
    const workspaceId = (isPlatformAdmin && req.query.workspaceId as string) || user?.workspaceId;
    
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
      return res.status(401).json({ error: "Workspace context required" });
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

    // Calculate points based on activities
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Get time entries for streak calculation
    const recentEntriesResult = await db
      .select({ 
        date: timeEntries.date,
        totalMinutes: sum(timeEntries.duration)
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employee?.id || ''),
          gte(timeEntries.date, weekAgo.toISOString().split('T')[0])
        )
      )
      .groupBy(timeEntries.date)
      .orderBy(desc(timeEntries.date));

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

    // Calculate total hours for points
    const totalHoursResult = await db
      .select({ totalMinutes: sum(timeEntries.duration) })
      .from(timeEntries)
      .where(eq(timeEntries.employeeId, employee?.id || ''));

    const totalMinutes = Number(totalHoursResult[0]?.totalMinutes || 0);
    const totalHours = Math.floor(totalMinutes / 60);
    
    // Points calculation: 10 points per hour + streak bonuses
    const basePoints = totalHours * 10;
    const streakBonus = streak * 50;
    const points = basePoints + streakBonus;
    
    // Level calculation: every 500 points = 1 level
    const level = Math.floor(points / 500) + 1;

    // Get rank among workspace employees
    const allEmployeesResult = await db
      .select({
        employeeId: timeEntries.employeeId,
        totalMinutes: sum(timeEntries.duration)
      })
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId))
      .groupBy(timeEntries.employeeId)
      .orderBy(desc(sum(timeEntries.duration)));

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
    console.error("[Gamification] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch gamification stats" });
  }
});

// Get leaderboard
router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id || !user?.workspaceId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get all employees with their time entries
    const leaderboardResult = await db
      .select({
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        userId: employees.userId,
        totalMinutes: sql<number>`COALESCE(SUM(${timeEntries.duration}), 0)::int`
      })
      .from(employees)
      .leftJoin(timeEntries, eq(employees.id, timeEntries.employeeId))
      .where(eq(employees.workspaceId, user.workspaceId))
      .groupBy(employees.id, employees.firstName, employees.lastName, employees.userId)
      .orderBy(desc(sql`COALESCE(SUM(${timeEntries.duration}), 0)`))
      .limit(10);

    const users = leaderboardResult.map((entry, index) => {
      const totalHours = Math.floor(Number(entry.totalMinutes || 0) / 60);
      const points = totalHours * 10;
      
      return {
        id: entry.employeeId,
        name: `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'Unknown',
        points,
        rank: index + 1,
        avatar: null,
        trend: Math.random() > 0.5 ? 'up' : 'same',
        isCurrentUser: entry.userId === user.id,
      };
    });

    res.json({ users });
  } catch (error) {
    console.error("[Gamification] Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Award points to user
router.post("/award-points", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { points, reason } = req.body;
    
    // Log the point award - in production, would persist to DB
    console.log(`[Gamification] Awarded ${points} points to user ${user.id}: ${reason}`);

    res.json({ success: true, message: `Awarded ${points} points` });
  } catch (error) {
    console.error("[Gamification] Error awarding points:", error);
    res.status(500).json({ error: "Failed to award points" });
  }
});

export default router;
