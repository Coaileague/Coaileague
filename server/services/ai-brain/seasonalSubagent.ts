/**
 * SeasonalSubagent - AI-Powered Holiday Theming Orchestrator
 * 
 * Part of the AI Brain Master Orchestrator
 * Autonomously detects holidays and applies creative themes across:
 * - Web platform
 * - Mobile interfaces
 * - Desktop workspaces
 * 
 * Features:
 * - Holiday calendar with configurable dates
 * - AI-generated theme creativity using Gemini 3 Pro
 * - Hotswap theming without restart
 * - Auto-rollback after holiday ends
 * - Hit detection preserving main UI elements
 */

import { UnifiedGeminiClient, GEMINI_MODELS } from './providers/geminiClient';
import { modelRoutingEngine } from './modelRoutingEngine';
import { platformEventBus, PlatformEventType } from '../platformEventBus';

// Holiday definitions with theming periods
export interface HolidayDefinition {
  id: string;
  name: string;
  emoji: string;
  startDate: { month: number; day: number }; // 1-indexed month
  endDate: { month: number; day: number };
  priority: number; // Higher priority wins if overlapping
  themeColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  decorations: string[]; // Types of decorations to apply
  musicEnabled?: boolean;
  animationIntensity: 'subtle' | 'moderate' | 'festive';
}

// The master holiday calendar
export const HOLIDAY_CALENDAR: HolidayDefinition[] = [
  {
    id: 'christmas',
    name: 'Christmas',
    emoji: '🎄',
    startDate: { month: 12, day: 1 },
    endDate: { month: 12, day: 26 },
    priority: 100,
    themeColors: {
      primary: '#c41e3a', // Christmas red
      secondary: '#165b33', // Christmas green
      accent: '#f8b229', // Gold
      background: '#0f1419', // Dark winter night
    },
    decorations: ['snowflakes', 'lights', 'ornaments', 'candy-canes', 'santa-hat'],
    animationIntensity: 'festive',
  },
  {
    id: 'new-year',
    name: 'New Year',
    emoji: '🎆',
    startDate: { month: 12, day: 31 },
    endDate: { month: 1, day: 2 },
    priority: 95,
    themeColors: {
      primary: '#ffd700', // Gold
      secondary: '#c0c0c0', // Silver
      accent: '#ff6b6b', // Champagne pink
      background: '#0a0a0a', // Midnight black
    },
    decorations: ['confetti', 'fireworks', 'champagne-bubbles', 'countdown'],
    animationIntensity: 'festive',
  },
  {
    id: 'valentine',
    name: "Valentine's Day",
    emoji: '💕',
    startDate: { month: 2, day: 10 },
    endDate: { month: 2, day: 15 },
    priority: 80,
    themeColors: {
      primary: '#e91e63', // Pink
      secondary: '#f48fb1', // Light pink
      accent: '#ff1744', // Red
      background: '#1a0a10', // Dark rose
    },
    decorations: ['hearts', 'roses', 'cupid-arrows'],
    animationIntensity: 'moderate',
  },
  {
    id: 'easter',
    name: 'Easter',
    emoji: '🐰',
    startDate: { month: 3, day: 25 }, // Approximate - should be calculated
    endDate: { month: 4, day: 1 },
    priority: 75,
    themeColors: {
      primary: '#ab47bc', // Purple
      secondary: '#66bb6a', // Spring green
      accent: '#ffee58', // Yellow
      background: '#f5f5f5', // Light spring
    },
    decorations: ['eggs', 'bunnies', 'flowers', 'butterflies'],
    animationIntensity: 'moderate',
  },
  {
    id: 'independence-day',
    name: 'Independence Day',
    emoji: '🇺🇸',
    startDate: { month: 7, day: 1 },
    endDate: { month: 7, day: 5 },
    priority: 85,
    themeColors: {
      primary: '#b71c1c', // Red
      secondary: '#0d47a1', // Blue
      accent: '#ffffff', // White
      background: '#0a1929', // Dark patriotic
    },
    decorations: ['stars', 'stripes', 'fireworks', 'flags'],
    animationIntensity: 'festive',
  },
  {
    id: 'halloween',
    name: 'Halloween',
    emoji: '🎃',
    startDate: { month: 10, day: 20 },
    endDate: { month: 11, day: 1 },
    priority: 90,
    themeColors: {
      primary: '#ff6f00', // Orange
      secondary: '#6a1b9a', // Purple
      accent: '#00c853', // Slime green
      background: '#0d0d0d', // Spooky black
    },
    decorations: ['pumpkins', 'bats', 'spiders', 'ghosts', 'cobwebs'],
    animationIntensity: 'moderate',
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    emoji: '🦃',
    startDate: { month: 11, day: 20 },
    endDate: { month: 11, day: 29 },
    priority: 70,
    themeColors: {
      primary: '#bf360c', // Burnt orange
      secondary: '#795548', // Brown
      accent: '#ffc107', // Gold
      background: '#1a1410', // Warm dark
    },
    decorations: ['leaves', 'cornucopia', 'pumpkins', 'acorns'],
    animationIntensity: 'subtle',
  },
];

// Active theme state
export interface ActiveSeasonalTheme {
  holidayId: string;
  holidayName: string;
  emoji: string;
  activatedAt: Date;
  expiresAt: Date;
  themeConfig: GeneratedThemeConfig;
  aiCreativity: string; // AI's creative description
  isActive: boolean;
}

// AI-generated theme configuration
export interface GeneratedThemeConfig {
  cssVariables: Record<string, string>;
  decorationElements: DecorationElement[];
  greetingMessage: string;
  subTitle: string;
  safeZones: string[]; // CSS selectors for hit detection protection
  animations: AnimationConfig[];
  soundEffects?: SoundConfig[];
}

export interface DecorationElement {
  id: string;
  type: 'particle' | 'overlay' | 'border' | 'icon' | 'banner';
  position: 'fixed' | 'absolute' | 'sticky';
  placement: 'top' | 'bottom' | 'left' | 'right' | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br' | 'scattered';
  content?: string;
  cssClass: string;
  zIndex: number;
  clickThrough: boolean; // Allows clicks to pass through
}

export interface AnimationConfig {
  name: string;
  target: string; // CSS selector
  keyframes: string;
  duration: string;
  iterationCount: string;
  easing: string;
}

export interface SoundConfig {
  id: string;
  trigger: 'load' | 'hover' | 'click';
  url: string;
  volume: number;
}

// Singleton instance
let seasonalSubagentInstance: SeasonalSubagent | null = null;

export class SeasonalSubagent {
  private geminiClient: UnifiedGeminiClient;
  private activeTheme: ActiveSeasonalTheme | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

  constructor() {
    this.geminiClient = new UnifiedGeminiClient();
    console.log('[SeasonalSubagent] Initialized - Holiday theming orchestrator ready');
  }

  /**
   * Start the seasonal monitoring service
   */
  async start(): Promise<void> {
    console.log('[SeasonalSubagent] Starting autonomous holiday monitoring...');
    
    // Initial check
    await this.checkAndApplySeasonalTheme();
    
    // Set up periodic checking
    this.checkInterval = setInterval(async () => {
      await this.checkAndApplySeasonalTheme();
    }, this.CHECK_INTERVAL_MS);

    // Register with AI Brain orchestration via event bus
    await platformEventBus.publish({
      type: 'ai_brain_action' as PlatformEventType,
      category: 'ai_brain',
      title: 'Seasonal Subagent Registered',
      description: 'Holiday theming orchestrator is now active and monitoring for seasonal events',
      metadata: {
        subagentId: 'seasonal-subagent',
        capabilities: ['holiday-detection', 'theme-generation', 'hotswap-theming'],
        status: 'active',
      },
    });
  }

  /**
   * Stop the seasonal monitoring service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[SeasonalSubagent] Stopped holiday monitoring');
  }

  /**
   * Check current date and apply/remove seasonal theme as needed
   */
  async checkAndApplySeasonalTheme(): Promise<void> {
    // Skip if seasonal theming is disabled by orchestration
    if (this.seasonalDisabled) {
      console.log('[SeasonalSubagent] Seasonal theming is disabled - skipping auto-check');
      return;
    }
    
    const now = new Date();
    const currentHoliday = this.getCurrentHoliday(now);

    if (currentHoliday) {
      // We're in a holiday period
      if (!this.activeTheme || this.activeTheme.holidayId !== currentHoliday.id) {
        // Need to activate new theme
        console.log(`[SeasonalSubagent] Holiday detected: ${currentHoliday.name} ${currentHoliday.emoji}`);
        await this.activateHolidayTheme(currentHoliday);
      }
    } else if (this.activeTheme) {
      // Holiday ended, revert to normal
      console.log('[SeasonalSubagent] Holiday ended, reverting to normal theme');
      await this.deactivateTheme();
    }
  }

  /**
   * Get the current active holiday based on date
   */
  getCurrentHoliday(date: Date): HolidayDefinition | null {
    const month = date.getMonth() + 1; // getMonth is 0-indexed
    const day = date.getDate();

    // Find all active holidays
    const activeHolidays = HOLIDAY_CALENDAR.filter(holiday => {
      return this.isDateInHolidayRange(month, day, holiday);
    });

    if (activeHolidays.length === 0) return null;

    // Return highest priority holiday
    return activeHolidays.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Check if a date falls within a holiday's active range
   */
  private isDateInHolidayRange(month: number, day: number, holiday: HolidayDefinition): boolean {
    const { startDate, endDate } = holiday;

    // Handle year wrap (e.g., New Year: Dec 31 - Jan 2)
    if (startDate.month > endDate.month) {
      // Wraps around year end
      return (month === startDate.month && day >= startDate.day) ||
             (month === endDate.month && day <= endDate.day) ||
             (month > startDate.month) || (month < endDate.month);
    } else if (startDate.month === endDate.month) {
      // Same month
      return month === startDate.month && day >= startDate.day && day <= endDate.day;
    } else {
      // Normal range
      return (month === startDate.month && day >= startDate.day) ||
             (month === endDate.month && day <= endDate.day) ||
             (month > startDate.month && month < endDate.month);
    }
  }

  /**
   * Activate a holiday theme using AI-generated creativity
   */
  async activateHolidayTheme(holiday: HolidayDefinition): Promise<ActiveSeasonalTheme> {
    console.log(`[SeasonalSubagent] Generating AI-powered theme for ${holiday.name}...`);

    // Use Gemini to generate creative theme
    const themeConfig = await this.generateAITheme(holiday);

    // Calculate expiration
    const now = new Date();
    const expiresAt = this.calculateExpirationDate(holiday);

    this.activeTheme = {
      holidayId: holiday.id,
      holidayName: holiday.name,
      emoji: holiday.emoji,
      activatedAt: now,
      expiresAt,
      themeConfig,
      aiCreativity: themeConfig.greetingMessage,
      isActive: true,
    };

    // Publish theme activation event
    await platformEventBus.publish({
      type: 'feature_released' as PlatformEventType,
      category: 'feature',
      title: `${holiday.emoji} ${holiday.name} Theme Activated!`,
      description: themeConfig.greetingMessage,
      metadata: {
        holidayId: holiday.id,
        holidayName: holiday.name,
        emoji: holiday.emoji,
        themeConfig: this.activeTheme,
        expiresAt: expiresAt.toISOString(),
        seasonal: true,
      },
    });

    console.log(`[SeasonalSubagent] Theme activated for ${holiday.name}, expires: ${expiresAt.toISOString()}`);
    
    return this.activeTheme;
  }

  /**
   * Use AI to generate creative theme configuration
   */
  private async generateAITheme(holiday: HolidayDefinition): Promise<GeneratedThemeConfig> {
    const prompt = `You are the SeasonalSubagent for CoAIleague workforce management platform.
Generate a creative and festive theme for ${holiday.name} ${holiday.emoji}.

Base colors to work with:
- Primary: ${holiday.themeColors.primary}
- Secondary: ${holiday.themeColors.secondary}
- Accent: ${holiday.themeColors.accent}
- Background: ${holiday.themeColors.background}

Available decorations: ${holiday.decorations.join(', ')}
Animation intensity: ${holiday.animationIntensity}

Create a JSON response with:
1. A warm, professional greeting message (max 50 words)
2. A subtitle for the platform header
3. CSS variables for theming
4. Decoration elements that enhance but don't obstruct the UI
5. Subtle animations that bring joy without distraction
6. Safe zones (CSS selectors) where decorations should NOT appear to preserve usability

IMPORTANT: Decorations must be click-through so they don't block user interactions.
Focus on corners, edges, and non-interactive areas.

Respond with ONLY valid JSON in this exact format:
{
  "greetingMessage": "...",
  "subTitle": "...",
  "cssVariables": {
    "--seasonal-primary": "...",
    "--seasonal-secondary": "...",
    "--seasonal-accent": "...",
    "--seasonal-glow": "..."
  },
  "decorationElements": [
    {
      "id": "...",
      "type": "particle|overlay|border|icon|banner",
      "position": "fixed",
      "placement": "top|corner-tl|scattered|etc",
      "cssClass": "...",
      "zIndex": 9999,
      "clickThrough": true
    }
  ],
  "safeZones": [
    "button",
    "input",
    ".sidebar-menu",
    "[data-testid]"
  ],
  "animations": [
    {
      "name": "...",
      "target": "...",
      "keyframes": "...",
      "duration": "...",
      "iterationCount": "infinite",
      "easing": "ease-in-out"
    }
  ]
}`;

    try {
      const response = await this.geminiClient.generate({
        featureKey: 'seasonal_theming',
        systemPrompt: 'You are a creative AI theme designer for enterprise software.',
        userMessage: prompt,
        modelTier: 'DIAGNOSTICS', // Use Pro for creative tasks
        antiYapPreset: 'diagnostics',
      });

      if (response.text) {
        // Parse AI response
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const config = JSON.parse(jsonMatch[0]) as GeneratedThemeConfig;
          console.log('[SeasonalSubagent] AI generated creative theme successfully');
          return config;
        }
      }
    } catch (error) {
      console.error('[SeasonalSubagent] AI theme generation failed, using defaults:', error);
    }

    // Fallback to default theme
    return this.getDefaultTheme(holiday);
  }

  /**
   * Default theme fallback if AI generation fails
   */
  private getDefaultTheme(holiday: HolidayDefinition): GeneratedThemeConfig {
    return {
      greetingMessage: `Happy ${holiday.name}! ${holiday.emoji} Wishing you joy and productivity from the CoAIleague team.`,
      subTitle: `${holiday.emoji} ${holiday.name} Edition`,
      cssVariables: {
        '--seasonal-primary': holiday.themeColors.primary,
        '--seasonal-secondary': holiday.themeColors.secondary,
        '--seasonal-accent': holiday.themeColors.accent,
        '--seasonal-glow': `${holiday.themeColors.accent}40`,
      },
      decorationElements: [
        {
          id: 'corner-decoration-tl',
          type: 'overlay',
          position: 'fixed',
          placement: 'corner-tl',
          cssClass: `seasonal-corner seasonal-${holiday.id}`,
          zIndex: 9998,
          clickThrough: true,
        },
        {
          id: 'corner-decoration-tr',
          type: 'overlay',
          position: 'fixed',
          placement: 'corner-tr',
          cssClass: `seasonal-corner seasonal-${holiday.id}`,
          zIndex: 9998,
          clickThrough: true,
        },
      ],
      safeZones: [
        'button',
        'input',
        'select',
        'textarea',
        'a',
        '[data-testid]',
        '.sidebar',
        '.modal',
        '.dialog',
        '.dropdown',
      ],
      animations: [
        {
          name: 'seasonal-glow',
          target: '.seasonal-corner',
          keyframes: '@keyframes seasonal-glow { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }',
          duration: '3s',
          iterationCount: 'infinite',
          easing: 'ease-in-out',
        },
      ],
    };
  }

  /**
   * Calculate when the theme should expire
   */
  private calculateExpirationDate(holiday: HolidayDefinition): Date {
    const now = new Date();
    const year = now.getFullYear();
    
    let endYear = year;
    // Handle year wrap for holidays like New Year
    if (holiday.endDate.month < holiday.startDate.month) {
      endYear = year + 1;
    }
    
    return new Date(endYear, holiday.endDate.month - 1, holiday.endDate.day, 23, 59, 59);
  }

  /**
   * Deactivate the current theme (hotswap back to normal)
   */
  async deactivateTheme(): Promise<void> {
    if (!this.activeTheme) return;

    const previousTheme = this.activeTheme;
    this.activeTheme = null;

    // Publish deactivation event
    await platformEventBus.publish({
      type: 'announcement' as PlatformEventType,
      category: 'announcement',
      title: `${previousTheme.holidayName} Theme Ended`,
      description: `The ${previousTheme.holidayName} seasonal theme has been deactivated. Platform restored to standard theme.`,
      metadata: {
        holidayId: previousTheme.holidayId,
        holidayName: previousTheme.holidayName,
        duration: Date.now() - previousTheme.activatedAt.getTime(),
        seasonal: true,
      },
    });

    console.log(`[SeasonalSubagent] Theme deactivated: ${previousTheme.holidayName}`);
  }

  /**
   * Force activate a specific holiday (for testing or manual override)
   */
  async forceActivateHoliday(holidayId: string): Promise<ActiveSeasonalTheme | null> {
    const holiday = HOLIDAY_CALENDAR.find(h => h.id === holidayId);
    if (!holiday) {
      console.error(`[SeasonalSubagent] Holiday not found: ${holidayId}`);
      return null;
    }

    // Deactivate current theme if any
    if (this.activeTheme) {
      await this.deactivateTheme();
    }

    return await this.activateHolidayTheme(holiday);
  }

  /**
   * Force deactivate the current theme - Trinity/AI Brain orchestration control
   * This permanently disables seasonal theming until manually re-enabled
   */
  private seasonalDisabled: boolean = false;

  async forceDeactivateTheme(reason?: string): Promise<{ success: boolean; message: string }> {
    console.log(`[SeasonalSubagent] Force deactivation requested: ${reason || 'No reason provided'}`);
    
    // Stop the automatic checking
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Mark as disabled
    this.seasonalDisabled = true;
    
    // Deactivate current theme if any
    if (this.activeTheme) {
      await this.deactivateTheme();
    }

    // Publish deactivation event
    await platformEventBus.publish({
      type: 'announcement' as PlatformEventType,
      category: 'announcement',
      title: 'Seasonal Theming Disabled',
      description: `Seasonal theming has been disabled by orchestration. Reason: ${reason || 'Manual override'}`,
      metadata: {
        seasonal: false,
        disabledBy: 'orchestration',
        reason: reason,
      },
    });

    console.log('[SeasonalSubagent] Seasonal theming FORCE DISABLED - will not auto-activate');
    return { success: true, message: 'Seasonal theming disabled successfully' };
  }

  /**
   * Re-enable seasonal theming after force deactivation
   */
  async enableSeasonalTheming(): Promise<{ success: boolean; message: string }> {
    this.seasonalDisabled = false;
    
    // Restart the automatic checking
    if (!this.checkInterval) {
      await this.start();
    }
    
    console.log('[SeasonalSubagent] Seasonal theming re-enabled');
    return { success: true, message: 'Seasonal theming re-enabled' };
  }

  /**
   * Check if seasonal theming is currently disabled
   */
  isSeasonalDisabled(): boolean {
    return this.seasonalDisabled;
  }

  /**
   * Get current active theme
   */
  getActiveTheme(): ActiveSeasonalTheme | null {
    return this.activeTheme;
  }

  /**
   * Get all available holidays
   */
  getHolidayCalendar(): HolidayDefinition[] {
    return HOLIDAY_CALENDAR;
  }

  /**
   * Preview a holiday theme without activating it
   */
  async previewHolidayTheme(holidayId: string): Promise<GeneratedThemeConfig | null> {
    const holiday = HOLIDAY_CALENDAR.find(h => h.id === holidayId);
    if (!holiday) return null;

    return await this.generateAITheme(holiday);
  }
}

// Factory function for singleton
export function getSeasonalSubagent(): SeasonalSubagent {
  if (!seasonalSubagentInstance) {
    seasonalSubagentInstance = new SeasonalSubagent();
  }
  return seasonalSubagentInstance;
}

// Initialize and start on import
export async function initializeSeasonalSubagent(): Promise<SeasonalSubagent> {
  const agent = getSeasonalSubagent();
  
  // Check for environment variable to disable seasonal theming
  if (process.env.DISABLE_SEASONAL_THEMING === 'true') {
    console.log('[SeasonalSubagent] Seasonal theming disabled via DISABLE_SEASONAL_THEMING env var');
    await agent.forceDeactivateTheme('Disabled via environment variable');
  } else {
    await agent.start();
  }
  
  return agent;
}
