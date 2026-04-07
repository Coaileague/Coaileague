/**
 * Animation Control Service
 * 
 * Provides API for controlling universal workspace animations
 * Features:
 * - AI Brain integration for dynamic animation updates
 * - Support console control via API
 * - Seasonal theme management
 * - WebSocket broadcast to all connected clients
 */

import { broadcastToAllClients } from '../websocket';
import { AuditLogger } from './audit-logger';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('animationControlService');


const auditLogger = new AuditLogger();

export type AnimationMode = 'idle' | 'search' | 'analyze' | 'voice' | 'warp' | 'success' | 'error';
export type SeasonalTheme = 'default' | 'winter' | 'spring' | 'summer' | 'autumn' | 'holiday' | 'halloween' | 'valentines';

export interface AnimationState {
  mode: AnimationMode;
  mainText: string;
  subText: string;
  progress: number;
  seasonalTheme: SeasonalTheme;
  duration?: number;
  isActive: boolean;
  triggeredBy?: string;
  triggeredAt?: Date;
}

export interface AnimationCommand {
  action: 'show' | 'hide' | 'update' | 'theme' | 'force';
  mode?: AnimationMode;
  mainText?: string;
  subText?: string;
  duration?: number;
  progress?: number;
  seasonalTheme?: SeasonalTheme;
  source?: 'ai-brain' | 'support' | 'system';
}

const SEASONAL_THEMES_CONFIG: Record<SeasonalTheme, { label: string; startMonth: number; startDay: number; endMonth: number; endDay: number }> = {
  default: { label: 'Default', startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 },
  winter: { label: 'Winter Wonderland', startMonth: 12, startDay: 21, endMonth: 3, endDay: 20 },
  spring: { label: 'Spring Bloom', startMonth: 3, startDay: 21, endMonth: 6, endDay: 20 },
  summer: { label: 'Summer Vibes', startMonth: 6, startDay: 21, endMonth: 9, endDay: 22 },
  autumn: { label: 'Autumn Harvest', startMonth: 9, startDay: 23, endMonth: 12, endDay: 20 },
  holiday: { label: 'Holiday Season', startMonth: 12, startDay: 15, endMonth: 1, endDay: 5 },
  halloween: { label: 'Spooky Season', startMonth: 10, startDay: 15, endMonth: 11, endDay: 1 },
  valentines: { label: 'Valentine\'s Day', startMonth: 2, startDay: 7, endMonth: 2, endDay: 21 }
};

const MODE_LABELS: Record<AnimationMode, string> = {
  idle: 'Standby',
  search: 'Searching',
  analyze: 'Analyzing',
  voice: 'Listening',
  warp: 'Loading',
  success: 'Complete',
  error: 'Error'
};

class AnimationControlService {
  private currentState: AnimationState;
  private forceOverride: AnimationState | null = null;

  constructor() {
    this.currentState = {
      mode: 'idle',
      mainText: PLATFORM.name,
      subText: 'Workforce Intelligence',
      progress: 0,
      seasonalTheme: this.detectSeasonalTheme(),
      isActive: false
    };
  }

  private detectSeasonalTheme(): SeasonalTheme {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    for (const [themeId, config] of Object.entries(SEASONAL_THEMES_CONFIG)) {
      if (themeId === 'default') continue;
      
      if (this.isDateInRange(month, day, config.startMonth, config.startDay, config.endMonth, config.endDay)) {
        return themeId as SeasonalTheme;
      }
    }

    return 'default';
  }

  private isDateInRange(
    month: number,
    day: number,
    startMonth: number,
    startDay: number,
    endMonth: number,
    endDay: number
  ): boolean {
    const current = month * 100 + day;
    const start = startMonth * 100 + startDay;
    const end = endMonth * 100 + endDay;

    if (start <= end) {
      return current >= start && current <= end;
    } else {
      return current >= start || current <= end;
    }
  }

  async executeCommand(command: AnimationCommand, executedBy: string): Promise<{ success: boolean; message: string; state?: AnimationState }> {
    const source = command.source || 'system';
    
    try {
      switch (command.action) {
        case 'show':
          return this.showAnimation(command, executedBy, source);
        
        case 'hide':
          return this.hideAnimation(executedBy, source);
        
        case 'update':
          return this.updateAnimation(command, executedBy, source);
        
        case 'theme':
          return this.setTheme(command.seasonalTheme || 'default', executedBy, source);
        
        case 'force':
          return this.forceAnimation(command, executedBy, source);
        
        default:
          return { success: false, message: `Unknown action: ${command.action}` };
      }
    } catch (error) {
      log.error('[AnimationControl] Command execution failed:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async showAnimation(
    command: AnimationCommand, 
    executedBy: string, 
    source: string
  ): Promise<{ success: boolean; message: string; state?: AnimationState }> {
    const mode = command.mode || 'warp';
    
    this.currentState = {
      mode,
      mainText: command.mainText || MODE_LABELS[mode],
      subText: command.subText || 'Please wait...',
      progress: command.progress || 0,
      seasonalTheme: command.seasonalTheme || this.currentState.seasonalTheme,
      duration: command.duration,
      isActive: true,
      triggeredBy: executedBy,
      triggeredAt: new Date()
    };

    const clientCount = broadcastToAllClients({
      type: 'animation:show',
      mode: this.currentState.mode,
      mainText: this.currentState.mainText,
      subText: this.currentState.subText,
      duration: this.currentState.duration,
      seasonalTheme: this.currentState.seasonalTheme,
      source
    });

    await auditLogger.logEvent(
      {
        actorId: executedBy,
        actorType: source === 'ai-brain' ? 'AI_AGENT' : 'SUPPORT_STAFF'
      },
      {
        eventType: 'animation:show',
        aggregateId: 'universal-animation',
        aggregateType: 'animation',
        payload: {
          mode,
          mainText: this.currentState.mainText,
          duration: this.currentState.duration,
          clientsNotified: clientCount
        }
      }
    );

    return { 
      success: true, 
      message: `Animation shown to ${clientCount} clients`,
      state: this.currentState 
    };
  }

  private async hideAnimation(
    executedBy: string, 
    source: string
  ): Promise<{ success: boolean; message: string; state?: AnimationState }> {
    this.currentState.isActive = false;
    this.forceOverride = null;

    const clientCount = broadcastToAllClients({
      type: 'animation:hide',
      source
    });

    await auditLogger.logEvent(
      {
        actorId: executedBy,
        actorType: source === 'ai-brain' ? 'AI_AGENT' : 'SUPPORT_STAFF'
      },
      {
        eventType: 'animation:hide',
        aggregateId: 'universal-animation',
        aggregateType: 'animation',
        payload: { clientsNotified: clientCount }
      }
    );

    return { 
      success: true, 
      message: `Animation hidden for ${clientCount} clients`,
      state: this.currentState 
    };
  }

  private async updateAnimation(
    command: AnimationCommand, 
    executedBy: string, 
    source: string
  ): Promise<{ success: boolean; message: string; state?: AnimationState }> {
    if (command.mode) this.currentState.mode = command.mode;
    if (command.mainText) this.currentState.mainText = command.mainText;
    if (command.subText) this.currentState.subText = command.subText;
    if (command.progress !== undefined) this.currentState.progress = command.progress;
    if (command.seasonalTheme) this.currentState.seasonalTheme = command.seasonalTheme;

    const clientCount = broadcastToAllClients({
      type: 'animation:update',
      updates: {
        mode: this.currentState.mode,
        mainText: this.currentState.mainText,
        subText: this.currentState.subText,
        progress: this.currentState.progress,
        seasonalTheme: this.currentState.seasonalTheme
      },
      source
    });

    return { 
      success: true, 
      message: `Animation updated for ${clientCount} clients`,
      state: this.currentState 
    };
  }

  private async setTheme(
    theme: SeasonalTheme, 
    executedBy: string, 
    source: string
  ): Promise<{ success: boolean; message: string; state?: AnimationState }> {
    this.currentState.seasonalTheme = theme;

    const clientCount = broadcastToAllClients({
      type: 'animation:theme',
      theme,
      source
    });

    await auditLogger.logEvent(
      {
        actorId: executedBy,
        actorType: source === 'ai-brain' ? 'AI_AGENT' : 'SUPPORT_STAFF'
      },
      {
        eventType: 'animation:theme_change',
        aggregateId: 'universal-animation',
        aggregateType: 'animation',
        payload: { 
          theme, 
          themeLabel: SEASONAL_THEMES_CONFIG[theme].label,
          clientsNotified: clientCount 
        }
      }
    );

    return { 
      success: true, 
      message: `Theme changed to ${SEASONAL_THEMES_CONFIG[theme].label} for ${clientCount} clients`,
      state: this.currentState 
    };
  }

  private async forceAnimation(
    command: AnimationCommand, 
    executedBy: string, 
    source: string
  ): Promise<{ success: boolean; message: string; state?: AnimationState }> {
    this.forceOverride = {
      mode: command.mode || 'warp',
      mainText: command.mainText || 'System Update',
      subText: command.subText || 'Please wait...',
      progress: command.progress || 0,
      seasonalTheme: command.seasonalTheme || this.currentState.seasonalTheme,
      duration: command.duration,
      isActive: true,
      triggeredBy: executedBy,
      triggeredAt: new Date()
    };

    const clientCount = broadcastToAllClients({
      type: 'animation:force',
      state: this.forceOverride,
      source
    });

    await auditLogger.logEvent(
      {
        actorId: executedBy,
        actorType: 'SUPPORT_STAFF'
      },
      {
        eventType: 'animation:force_override',
        aggregateId: 'universal-animation',
        aggregateType: 'animation',
        payload: { 
          mode: this.forceOverride.mode,
          mainText: this.forceOverride.mainText,
          clientsNotified: clientCount 
        }
      }
    );

    return { 
      success: true, 
      message: `Force animation sent to ${clientCount} clients`,
      state: this.forceOverride 
    };
  }

  getState(): AnimationState {
    return this.forceOverride || this.currentState;
  }

  getCurrentTheme(): SeasonalTheme {
    return this.currentState.seasonalTheme;
  }

  getAvailableThemes(): Array<{ id: SeasonalTheme; label: string }> {
    return Object.entries(SEASONAL_THEMES_CONFIG).map(([id, config]) => ({
      id: id as SeasonalTheme,
      label: config.label
    }));
  }

  getAvailableModes(): Array<{ id: AnimationMode; label: string }> {
    return Object.entries(MODE_LABELS).map(([id, label]) => ({
      id: id as AnimationMode,
      label
    }));
  }
}

export const animationControlService = new AnimationControlService();
