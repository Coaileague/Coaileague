import { db } from '../../db';
import { 
  achievements,
  employeeAchievements,
  employeePoints,
  pointsTransactions,
  leaderboardCache,
  employees,
  type Achievement,
  type EmployeeAchievement,
  type EmployeePoints,
  type InsertAchievement,
  type InsertEmployeeAchievement,
} from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { subDays, startOfWeek, startOfMonth } from 'date-fns';

// Level thresholds
const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000,
  17000, 23000, 30000, 40000, 52000, 67000, 85000, 107000, 133000, 165000
];

// Default achievements to seed
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
  /**
   * Initialize gamification for a workspace with default achievements
   */
  async initializeWorkspace(workspaceId: string): Promise<void> {
    // Check if achievements already exist for this workspace
    const existing = await db.select()
      .from(achievements)
      .where(eq(achievements.workspaceId, workspaceId))
      .limit(1);

    if (existing.length > 0) return;

    // Insert default achievements
    const achievementsToInsert = DEFAULT_ACHIEVEMENTS.map(a => ({
      ...a,
      workspaceId,
      isActive: true,
    }));

    await db.insert(achievements).values(achievementsToInsert);
  }

  /**
   * Get or create employee points record
   */
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
      currentStreak: 0,
      longestStreak: 0,
      pointsThisMonth: 0,
      pointsThisWeek: 0,
      achievementsEarned: 0,
    }).returning();

    return created;
  }

  /**
   * Award points to an employee
   */
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

    // Get or create employee points record
    const empPoints = await this.getOrCreateEmployeePoints(workspaceId, employeeId);
    const oldLevel = empPoints.currentLevel || 1;
    const newTotal = (empPoints.totalPoints || 0) + points;
    const newLevel = this.calculateLevel(newTotal);
    const levelUp = newLevel > oldLevel;

    // Update points
    await db.update(employeePoints)
      .set({
        totalPoints: newTotal,
        currentLevel: newLevel,
        pointsThisMonth: (empPoints.pointsThisMonth || 0) + points,
        pointsThisWeek: (empPoints.pointsThisWeek || 0) + points,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employeePoints.id, empPoints.id));

    // Record transaction
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

  /**
   * Award an achievement to an employee
   */
  async awardAchievement(params: {
    workspaceId: string;
    employeeId: string;
    achievementId: string;
    reason?: string;
    metadata?: any;
  }): Promise<{ achievement: Achievement; points: number } | null> {
    const { workspaceId, employeeId, achievementId, reason, metadata } = params;

    // Check if already earned
    const existing = await db.select()
      .from(employeeAchievements)
      .where(and(
        eq(employeeAchievements.employeeId, employeeId),
        eq(employeeAchievements.achievementId, achievementId)
      ))
      .limit(1);

    if (existing.length > 0) return null;

    // Get achievement details
    const [achievement] = await db.select()
      .from(achievements)
      .where(eq(achievements.id, achievementId))
      .limit(1);

    if (!achievement) return null;

    // Award the achievement
    await db.insert(employeeAchievements).values({
      workspaceId,
      employeeId,
      achievementId,
      pointsAwarded: achievement.pointsValue || 0,
      reason,
      metadata,
      earnedAt: new Date(),
    });

    // Update achievement count
    await db.update(employeePoints)
      .set({
        achievementsEarned: sql`COALESCE(achievements_earned, 0) + 1`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(employeePoints.workspaceId, workspaceId),
        eq(employeePoints.employeeId, employeeId)
      ));

    // Award points for the achievement
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

  /**
   * Update streak for an employee (call on clock-in)
   */
  async updateStreak(workspaceId: string, employeeId: string): Promise<{ streak: number; isNewRecord: boolean }> {
    const empPoints = await this.getOrCreateEmployeePoints(workspaceId, employeeId);
    
    const now = new Date();
    const lastClockIn = empPoints.lastClockIn;
    
    let newStreak = 1;
    let isNewRecord = false;

    if (lastClockIn) {
      const daysSinceLastClockIn = Math.floor((now.getTime() - new Date(lastClockIn).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastClockIn === 1) {
        // Consecutive day - increase streak
        newStreak = (empPoints.currentStreak || 0) + 1;
      } else if (daysSinceLastClockIn === 0) {
        // Same day - keep streak
        newStreak = empPoints.currentStreak || 1;
      }
      // Otherwise streak resets to 1
    }

    const longestStreak = Math.max(newStreak, empPoints.longestStreak || 0);
    isNewRecord = newStreak > (empPoints.longestStreak || 0);

    await db.update(employeePoints)
      .set({
        currentStreak: newStreak,
        longestStreak,
        lastClockIn: now,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(employeePoints.id, empPoints.id));

    return { streak: newStreak, isNewRecord };
  }

  /**
   * Check and award streak achievements
   */
  async checkStreakAchievements(workspaceId: string, employeeId: string, currentStreak: number): Promise<Achievement[]> {
    const awardedAchievements: Achievement[] = [];

    // Get streak achievements
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

  /**
   * Get employee achievements
   */
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

  /**
   * Get workspace leaderboard
   */
  async getLeaderboard(workspaceId: string, period: 'weekly' | 'monthly' | 'all_time' = 'all_time', limit: number = 10): Promise<any[]> {
    const leaderboard = await db.select({
      employeeId: employeePoints.employeeId,
      points: period === 'weekly' ? employeePoints.pointsThisWeek : 
              period === 'monthly' ? employeePoints.pointsThisMonth : 
              employeePoints.totalPoints,
      level: employeePoints.currentLevel,
      streak: employeePoints.currentStreak,
      achievementsEarned: employeePoints.achievementsEarned,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employeePoints)
    .innerJoin(employees, eq(employeePoints.employeeId, employees.id))
    .where(eq(employeePoints.workspaceId, workspaceId))
    .orderBy(desc(
      period === 'weekly' ? employeePoints.pointsThisWeek : 
      period === 'monthly' ? employeePoints.pointsThisMonth : 
      employeePoints.totalPoints
    ))
    .limit(limit);

    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
      name: `${entry.firstName || ''} ${entry.lastName || ''}`.trim(),
    }));
  }

  /**
   * Get all achievements for a workspace
   */
  async getWorkspaceAchievements(workspaceId: string): Promise<Achievement[]> {
    return await db.select()
      .from(achievements)
      .where(and(
        eq(achievements.workspaceId, workspaceId),
        eq(achievements.isActive, true)
      ))
      .orderBy(achievements.sortOrder);
  }

  /**
   * Calculate level from total points
   */
  private calculateLevel(totalPoints: number): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalPoints >= LEVEL_THRESHOLDS[i]) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Reset weekly points (call from scheduled job)
   */
  async resetWeeklyPoints(): Promise<void> {
    await db.update(employeePoints)
      .set({ pointsThisWeek: 0, updatedAt: new Date() });
  }

  /**
   * Reset monthly points (call from scheduled job)
   */
  async resetMonthlyPoints(): Promise<void> {
    await db.update(employeePoints)
      .set({ pointsThisMonth: 0, updatedAt: new Date() });
  }

  /**
   * Get recent recognition feed
   */
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
