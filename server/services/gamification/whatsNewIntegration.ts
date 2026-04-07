import { gamificationEvents, type AchievementEvent } from './gamificationEvents';
import { publishPlatformUpdate } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('whatsNewIntegration');


/**
 * Integrates gamification with "What's New" feature updates
 * Sends badge/achievement updates to end users about new platform features
 */
export class WhatsNewGamificationBridge {
  private static initialized = false;

  /**
   * Initialize "What's New" listeners for gamification events
   */
  static initializeListeners(): void {
    if (this.initialized) {
      log.info('[WhatsNewGamificationBridge] Already initialized, skipping');
      return;
    }

    gamificationEvents.on('achievement_unlocked', (data: AchievementEvent) => this.announceAchievement(data));

    this.initialized = true;
    log.info('[WhatsNewGamificationBridge] What\'s New integration initialized');
  }

  private static async announceAchievement(data: AchievementEvent): Promise<void> {
    try {
      const { achievement, employeeId, workspaceId, points } = data;

      // Create a "What's New" announcement for the achievement
      await publishPlatformUpdate({
        type: 'announcement',
        category: 'feature',
        title: `Achievement Unlocked: ${achievement.name}`,
        description: `${achievement.description} (+${points} XP)`,
        workspaceId,
        metadata: {
          achievementId: achievement.id,
          employeeId,
          pointsAwarded: points,
          rarity: achievement.rarity,
          category: achievement.category,
        },
        visibility: 'all',
        priority: achievement.rarity === 'legendary' ? 1 : 2,
      });

      // If it's a rare/legendary achievement, also create a platform-wide announcement
      if (['rare', 'epic', 'legendary'].includes(achievement.rarity)) {
        log.info(`[WhatsNewGamificationBridge] Broadcasting rare achievement: ${achievement.name}`);
      }

      log.info(`[WhatsNewGamificationBridge] Created update: ${achievement.name}`);
    } catch (error) {
      log.error('[WhatsNewGamificationBridge] Error announcing achievement:', error);
    }
  }

  /**
   * Announce feature discovery for gamification
   */
  static async announceFeatureDiscovery(params: {
    workspaceId: string;
    employeeId: string;
    featureName: string;
    points: number;
  }): Promise<void> {
    const featureNames: Record<string, string> = {
      'ai_scheduling': 'AI-Powered Scheduling',
      'analytics': 'Advanced Analytics',
      'mobile_app': 'Mobile Application',
      'helpai_chat': 'HelpAI Chat Assistant',
      'time_tracking': 'Time Tracking System',
      'calendar_sync': 'Calendar Sync',
      'gamification': 'Gamification System',
    };

    try {
      await publishPlatformUpdate({
        type: 'feature_updated',
        category: 'feature',
        title: `Feature Explored: ${featureNames[params.featureName] || params.featureName}`,
        description: `You've earned ${params.points} XP for discovering new platform features.`,
        workspaceId: params.workspaceId,
        metadata: {
          employeeId: params.employeeId,
          feature: params.featureName,
          pointsAwarded: params.points,
        },
        visibility: 'staff',
        priority: 3,
      });
    } catch (error) {
      log.error('[WhatsNewGamificationBridge] Error announcing feature discovery:', error);
    }
  }
}
