import { platformEventBus } from '../eventBus/platformEventBus';
import { db } from '../../db';
import { employees, employeePoints } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Sends gamification milestones to AI Brain for onboarding insight
 * and personalized feature recommendations
 */

export class AiBrainNotifier {
  /**
   * Initialize AI Brain listeners for gamification events
   */
  static initializeListeners(): void {
    // Listen for gamification milestones
    platformEventBus.on('gamification_milestone', (data: any) => this.notifyAiBrain(data));
    platformEventBus.on('achievement_unlocked', (data: any) => this.notifyAchievement(data));

    console.log('[AiBrainNotifier] AI Brain notification system initialized');
  }

  private static async notifyAiBrain(data: any): Promise<void> {
    try {
      const { type, workspaceId, employeeId, points, feature } = data;

      // Get employee info
      const [employee] = await db.select()
        .from(employees)
        .where(eq(employees.id, employeeId))
        .limit(1);

      if (!employee) return;

      // Get points summary
      const [pointsRecord] = await db.select()
        .from(employeePoints)
        .where(and(
          eq(employeePoints.workspaceId, workspaceId),
          eq(employeePoints.employeeId, employeeId)
        ))
        .limit(1);

      const payload = {
        type: 'gamification_milestone',
        milestone: type,
        employee: {
          id: employeeId,
          name: `${employee.firstName} ${employee.lastName}`,
          workspaceId,
        },
        stats: {
          totalPoints: pointsRecord?.totalPoints || 0,
          level: pointsRecord?.currentLevel || 1,
          streak: pointsRecord?.currentStreak || 0,
          pointsAwarded: points || 0,
        },
        metadata: {
          feature,
          timestamp: new Date().toISOString(),
        },
      };

      // Emit to AI Brain for learning and insights
      platformEventBus.emit('ai_brain_notification', {
        type: 'gamification_engagement',
        priority: this.calculatePriority(type),
        data: payload,
      });

      console.log(`[AiBrainNotifier] Notified AI Brain: ${type} for ${employeeId}`);
    } catch (error) {
      console.error('[AiBrainNotifier] Error notifying AI Brain:', error);
    }
  }

  private static async notifyAchievement(data: any): Promise<void> {
    try {
      const { achievement, employeeId, workspaceId, points } = data;

      const payload = {
        type: 'achievement_unlocked',
        achievement: achievement.name,
        description: achievement.description,
        category: achievement.category,
        rarity: achievement.rarity,
        employee: {
          id: employeeId,
          workspaceId,
        },
        pointsAwarded: points || 0,
        timestamp: new Date().toISOString(),
      };

      // Emit to AI Brain for personalized recommendations
      platformEventBus.emit('ai_brain_notification', {
        type: 'achievement_milestone',
        priority: 'high',
        data: payload,
      });

      // Also emit for "What's New" feature updates
      platformEventBus.emit('platform_update_event', {
        type: 'achievement',
        employeeId,
        workspaceId,
        details: achievement,
      });

      console.log(`[AiBrainNotifier] Achievement notification: ${achievement.name}`);
    } catch (error) {
      console.error('[AiBrainNotifier] Error notifying achievement:', error);
    }
  }

  private static calculatePriority(type: string): 'low' | 'medium' | 'high' => {
    const highPriority = ['profile_complete', 'feature_adoption', 'level_up'];
    const mediumPriority = ['shift_swap', 'full_day_worked', 'early_arrival'];
    
    if (highPriority.includes(type)) return 'high';
    if (mediumPriority.includes(type)) return 'medium';
    return 'low';
  }

  /**
   * Get engagement insights for a user
   */
  static async getEngagementInsights(workspaceId: string, employeeId: string): Promise<any> {
    try {
      const [pointsRecord] = await db.select()
        .from(employeePoints)
        .where(and(
          eq(employeePoints.workspaceId, workspaceId),
          eq(employeePoints.employeeId, employeeId)
        ))
        .limit(1);

      if (!pointsRecord) return null;

      return {
        engagement_level: pointsRecord.currentLevel || 1,
        activity_score: pointsRecord.totalPoints || 0,
        streak_status: pointsRecord.currentStreak || 0,
        monthly_performance: pointsRecord.pointsThisMonth || 0,
        achievements_count: pointsRecord.achievementsEarned || 0,
        last_active: pointsRecord.lastActivityAt,
      };
    } catch (error) {
      console.error('[AiBrainNotifier] Error getting engagement insights:', error);
      return null;
    }
  }
}

// Initialize on module load
AiBrainNotifier.initializeListeners();
