import { platformEventBus } from '../platformEventBus';

/**
 * Integrates gamification with "What's New" feature updates
 * Sends badge/achievement updates to end users about new platform features
 */

export class WhatsNewGamificationBridge {
  /**
   * Initialize "What's New" listeners for gamification events
   */
  static initializeListeners(): void {
    platformEventBus.on('platform_update_event', (data: any) => this.handlePlatformUpdate(data));
    platformEventBus.on('achievement_unlocked', (data: any) => this.announceNewFeature(data));

    console.log('[WhatsNewGamificationBridge] What\'s New integration initialized');
  }

  private static async handlePlatformUpdate(data: any): Promise<void> {
    try {
      const { type, employeeId, workspaceId, details } = data;

      // If a platform feature was used that earned an achievement, announce it
      if (type === 'achievement' && details) {
        await this.createWhatsNewUpdate({
          title: `You unlocked: ${details.name}`,
          description: details.description,
          category: 'gamification',
          employeeId,
          workspaceId,
          metadata: {
            achievementId: details.id,
            pointsAwarded: details.pointsValue,
            rarity: details.rarity,
          },
        });
      }

      // Announce feature adoption achievements
      if (type === 'feature_adoption') {
        const featureNames: Record<string, string> = {
          'ai_scheduling': 'AI-Powered Scheduling',
          'analytics': 'Advanced Analytics',
          'mobile_app': 'Mobile Application',
          'helpai_chat': 'HelpAI Chat Assistant',
          'time_tracking': 'Time Tracking System',
        };

        await this.createWhatsNewUpdate({
          title: `Great work exploring ${featureNames[details.feature] || details.feature}!`,
          description: `You've earned achievement points for discovering new platform features.`,
          category: 'feature_discovery',
          employeeId,
          workspaceId,
          metadata: {
            feature: details.feature,
            pointsAwarded: details.points,
          },
        });
      }
    } catch (error) {
      console.error('[WhatsNewGamificationBridge] Error handling platform update:', error);
    }
  }

  private static async announceNewFeature(data: any): Promise<void> {
    try {
      const { achievement, employeeId, workspaceId, points } = data;

      // Create a "What's New" announcement for the achievement
      await this.createWhatsNewUpdate({
        title: `Achievement Unlocked: ${achievement.name}`,
        description: achievement.description,
        category: 'milestone',
        employeeId,
        workspaceId,
        metadata: {
          achievement: achievement.name,
          pointsAwarded: points,
          rarity: achievement.rarity,
        },
      });

      // If it's a rare/legendary achievement, make it platform-wide visible
      if (['rare', 'epic', 'legendary'].includes(achievement.rarity)) {
        platformEventBus.emit('achievement_announcement', {
          type: 'rare_achievement',
          achievement: achievement.name,
          employeeId,
          workspaceId,
          broadcast: true,
        });
      }
    } catch (error) {
      console.error('[WhatsNewGamificationBridge] Error announcing feature:', error);
    }
  }

  private static async createWhatsNewUpdate(params: {
    title: string;
    description: string;
    category: string;
    employeeId: string;
    workspaceId: string;
    metadata?: any;
  }): Promise<void> {
    // Emit event for What's New service to consume
    platformEventBus.emit('whats_new_update', {
      type: 'gamification',
      title: params.title,
      description: params.description,
      category: params.category,
      targetEmployeeId: params.employeeId,
      workspaceId: params.workspaceId,
      timestamp: new Date().toISOString(),
      metadata: params.metadata,
      displayDuration: 3600000, // 1 hour
    });

    console.log(`[WhatsNewGamificationBridge] Created update: ${params.title}`);
  }

  /**
   * Check if an employee has new gamification updates
   */
  static async getNewUpdates(employeeId: string, workspaceId: string, since?: Date): Promise<any[]> {
    // This would query a whatsNewUpdates table filtered by employee/workspace
    // For now, returning empty array as this integrates with existing What's New system
    return [];
  }
}

// Initialize on module load
WhatsNewGamificationBridge.initializeListeners();
