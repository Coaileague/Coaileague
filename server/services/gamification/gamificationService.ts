import { db } from '../../db';
import {
  achievements,
  employeeAchievements,
  employeePoints,
  pointsTransactions,
  leaderboardCache,
  employees,
  type Achievement,
  type InsertAchievement,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

type EmployeePoints = typeof employeePoints.$inferSelect;
type EmployeeAchievement = typeof employeeAchievements.$inferSelect;

const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000,
  17000, 23000, 30000, 40000, 52000, 67000, 85000, 107000, 133000, 165000
];

export const DEFAULT_ACHIEVEMENTS: Omit<InsertAchievement, 'workspaceId'>[] = [
  { name: 'First Clock In', description: 'Clocked in for the first time', category: 'milestone', pointsValue: 10, rarity: 'common', triggerType: 'first_clock_in', triggerThreshold: 1, icon: 'Clock' },
  { name: 'Early Bird', description: 'Clocked in before 7 AM', category: 'attendance', pointsValue: 15, rarity: 'uncommon', triggerType: 'early_clock_in', triggerThreshold: 7, icon: 'Sunrise' },
  { name: 'Week Warrior', description: '7-day clock-in streak', category: 'attendance', pointsValue: 50, rarity: 'uncommon', triggerType: 'clock_in_streak', triggerThreshold: 7, icon: 'Calendar' },
  { name: 'Month Master', description: '30-day clock-in streak', category: 'attendance', pointsValue: 200, rarity: 'rare', triggerType: 'clock_in_streak', triggerThreshold: 30, icon: 'Trophy' },
  { name: 'Century Clubber', description: 'Worked 100 total hours', category: 'milestone', pointsValue: 100, rarity: 'uncommon', triggerType: 'hours_worked', triggerThreshold: 100, icon: 'Timer' },
  { name: 'Overtime Hero', description: 'Worked 50+ hours in a week', category: 'performance', pointsValue: 75, rarity: 'rare', triggerType: 'weekly_hours', triggerThreshold: 50, icon: 'Zap' },
  { name: 'Perfect Attendance', description: 'No missed shifts in a month', category: 'attendance', pointsValue: 150, rarity: 'rare', triggerType: 'perfect_month', triggerThreshold: 1, icon: 'Star' },
  { name: 'Team Player', description: 'Helped cover 5 shifts', category: 'teamwork', pointsValue: 100, rarity: 'uncommon', triggerType: 'shifts_covered', triggerThreshold: 5, icon: 'Users' },
  { name: 'Legend', description: 'Reached level 10', category: 'milestone', pointsValue: 500, rarity: 'legendary', triggerType: 'level_reached', triggerThreshold: 10, icon: 'Crown' },
];

export class GamificationService {
  async initializeWorkspace(workspaceId: string): Promise<void> {
    const existing = await db.select()
      .from(achievements)
      .where(eq(achievements.workspaceId, workspaceId))
      .limit(1);

    if (existing.length > 0) return;

    const achievementsToInsert = DEFAULT_ACHIEVEMENTS.map(a => ({
      ...a,
      workspaceId,
      isActive: true,
    }));

    await db.insert(achievements).values(achievementsToInsert);
  }

  async getOrCreateEmployeePoints(workspaceId: string, employeeId: string): Promise<EmployeePoints> {
    const [existing] = await db.select()
      .from(employeePoints)
      .where(and(
        eq(employeePoints.workspaceId, workspaceId),
        eq(employeePoints.employeeId, employeeId)
      ))
      .limit(1);

    if (existing) return existing;

    const [created] = await db.insert(employeePoints).values({
      workspaceId,
      employeeId,
      totalPoints: 0,
      currentLevel: 1,
      streakDays: 0,
      longestStreak: 0,
      monthlyPoints: 0,
      weeklyPoints: 0,
      achievementsEarned: 0,
    }).returning();

    return created;
  }

  async awardPoints(params: {
    workspaceId: string;
    employeeId: string;
    points: number;
    transactionType: string;
    referenceId?: string;
    referenceType?: string;
    description?: string;
    awardedBy?: string;
  }): Promise<{ newTotal: number; levelUp: boolean; newLevel: number }> {
    const { workspaceId, employeeId, points, transactionType, referenceId, referenceType, description, awardedBy } = params;

    const empPoints = await this.getOrCreateEmployeePoints(workspaceId, employeeId);
    const oldLevel = empPoints.currentLevel || 1;
    const newTotal = (empPoints.totalPoints || 0) + points;
    const newLevel = this.calculateLevel(newTotal);
    const levelUp = newLevel > oldLevel;

    await db.update(employeePoints)
      .set({
        totalPoints: newTotal,
        currentLevel: newLevel,
        monthlyPoints: (empPoints.monthlyPoints || 0) + points,
        weeklyPoints: (empPoints.weeklyPoints || 0) + points,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employeePoints.id, empPoints.id));

    await db.insert(pointsTransactions).values({
      workspaceId,
      employeeId,
      points,
      transactionType,
      referenceId,
      referenceType,
      description,
      awardedBy,
    });

    return { newTotal, levelUp, newLevel };
  }

  async awardAchievement(params: {
    workspaceId: string;
    employeeId: string;
    achievementId: string;
    reason?: string;
    metadata?: any;
  }): Promise<{ achievement: Achievement; points: number } | null> {
    const { workspaceId, employeeId, achievementId, reason, metadata } = params;

    const existing = await db.select()
      .from(employeeAchievements)
      .where(and(
        eq(employeeAchievements.employeeId, employeeId),
        eq(employeeAchievements.achievementId, achievementId)
      ))
      .limit(1);

    if (existing.length > 0) return null;

    const [achievement] = await db.select()
      .from(achievements)
      .where(eq(achievements.id, achievementId))
      .limit(1);

    if (!achievement) return null;

    const [insertedAchievement] = await db.insert(employeeAchievements).values({
      workspaceId,
      employeeId,
      achievementId,
      pointsAwarded: achievement.pointsValue || 0,
      reason,
      metadata,
      earnedAt: new Date(),
    })
    .returning();

    if (!insertedAchievement) return null;

    await db.update(employeePoints)
      .set({
        achievementsEarned: sql`COALESCE(achievements_earned, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(employeePoints.workspaceId, workspaceId),
        eq(employeePoints.employeeId, employeeId)
      ));

    if (achievement.pointsValue && achievement.pointsValue > 0) {
      await this.awardPoints({
        workspaceId,
        employeeId,
        points: achievement.pointsValue,
        transactionType: 'achievement',
        referenceId: achievementId,
        referenceType: 'achievement',
        description: `Earned achievement: ${achievement.name}`,
      });
    }

    return { achievement, points: achievement.pointsValue || 0 };
  }

  async updateStreak(workspaceId: string, employeeId: string): Promise<{ streak: number; isNewRecord: boolean }> {
    const empPoints = await this.getOrCreateEmployeePoints(workspaceId, employeeId);

    const now = new Date();
    const lastClockIn = empPoints.lastClockIn;

    let newStreak = 1;
    let isNewRecord = false;

    if (lastClockIn) {
      const daysSinceLastClockIn = Math.floor((now.getTime() - new Date(lastClockIn).getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceLastClockIn === 1) {
        newStreak = (empPoints.streakDays || 0) + 1;
      } else if (daysSinceLastClockIn === 0) {
        newStreak = empPoints.streakDays || 1;
      }
    }

    const longestStreak = Math.max(newStreak, empPoints.longestStreak || 0);
    isNewRecord = newStreak > (empPoints.longestStreak || 0);

    await db.update(employeePoints)
      .set({
        streakDays: newStreak,
        longestStreak,
        lastClockIn: now,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(employeePoints.id, empPoints.id));

    return { streak: newStreak, isNewRecord };
  }

  async checkStreakAchievements(workspaceId: string, employeeId: string, currentStreak: number): Promise<Achievement[]> {
    const awardedAchievements: Achievement[] = [];

    const streakAchievements = await db.select()
      .from(achievements)
      .where(and(
        eq(achievements.workspaceId, workspaceId),
        eq(achievements.triggerType, 'clock_in_streak'),
        eq(achievements.isActive, true)
      ));

    for (const achievement of streakAchievements) {
      if (achievement.triggerThreshold && currentStreak >= achievement.triggerThreshold) {
        const result = await this.awardAchievement({
          workspaceId,
          employeeId,
          achievementId: achievement.id,
          reason: `Reached ${currentStreak}-day clock-in streak`,
        });
        if (result) {
          awardedAchievements.push(result.achievement);
        }
      }
    }

    return awardedAchievements;
  }

  async getEmployeeAchievements(workspaceId: string, employeeId: string): Promise<(EmployeeAchievement & { achievement: Achievement })[]> {
    const earned = await db.select({
      ea: employeeAchievements,
      achievement: achievements,
    })
    .from(employeeAchievements)
    .innerJoin(achievements, eq(employeeAchievements.achievementId, achievements.id))
    .where(and(
      eq(employeeAchievements.workspaceId, workspaceId),
      eq(employeeAchievements.employeeId, employeeId)
    ))
    .orderBy(desc(employeeAchievements.earnedAt));

    return earned.map(row => ({
      ...row.ea,
      achievement: row.achievement,
    }));
  }

  async getLeaderboard(workspaceId: string, period: 'weekly' | 'monthly' | 'all_time' = 'all_time', limit: number = 10): Promise<any[]> {
    const pointsCol = period === 'weekly' ? employeePoints.weeklyPoints :
                      period === 'monthly' ? employeePoints.monthlyPoints :
                      employeePoints.totalPoints;

    const leaderboard = await db.select({
      employeeId: employeePoints.employeeId,
      points: pointsCol,
      level: employeePoints.currentLevel,
      streak: employeePoints.streakDays,
      achievementsEarned: employeePoints.achievementsEarned,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employeePoints)
    .innerJoin(employees, eq(employeePoints.employeeId, employees.id))
    .where(eq(employeePoints.workspaceId, workspaceId))
    .orderBy(desc(pointsCol))
    .limit(limit);

    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
      name: `${entry.firstName || ''} ${entry.lastName || ''}`.trim(),
    }));
  }

  async getWorkspaceAchievements(workspaceId: string): Promise<Achievement[]> {
    return await db.select()
      .from(achievements)
      .where(and(
        eq(achievements.workspaceId, workspaceId),
        eq(achievements.isActive, true)
      ))
      .orderBy(achievements.sortOrder);
  }

  private calculateLevel(totalPoints: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalPoints >= LEVEL_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1;
  }

  async resetWeeklyPoints(): Promise<void> {
    await db.update(employeePoints)
      .set({ weeklyPoints: 0, updatedAt: new Date() });
  }

  async resetMonthlyPoints(): Promise<void> {
    await db.update(employeePoints)
      .set({ monthlyPoints: 0, updatedAt: new Date() });
  }

  async getRecognitionFeed(workspaceId: string, limit: number = 20): Promise<any[]> {
    const feed = await db.select({
      id: employeeAchievements.id,
      employeeId: employeeAchievements.employeeId,
      achievementId: employeeAchievements.achievementId,
      earnedAt: employeeAchievements.earnedAt,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      achievementName: achievements.name,
      achievementIcon: achievements.icon,
      pointsEarned: achievements.pointsValue,
    })
    .from(employeeAchievements)
    .innerJoin(employees, eq(employeeAchievements.employeeId, employees.id))
    .innerJoin(achievements, eq(employeeAchievements.achievementId, achievements.id))
    .where(eq(employeeAchievements.workspaceId, workspaceId))
    .orderBy(desc(employeeAchievements.earnedAt))
    .limit(limit);

    return feed.map(item => ({
      id: item.id,
      employeeName: `${item.employeeFirstName || ''} ${item.employeeLastName || ''}`.trim(),
      achievementName: item.achievementName,
      achievementIcon: item.achievementIcon || 'trophy',
      pointsEarned: item.pointsEarned || 0,
      earnedAt: item.earnedAt,
    }));
  }
}

export const gamificationService = new GamificationService();
