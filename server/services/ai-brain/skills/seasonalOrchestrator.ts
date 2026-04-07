/**
 * SeasonalOrchestrator - AI Brain skill for universal seasonal theming
 * 
 * Orchestrates platform-wide seasonal appearances:
 * - Auto-detects current season and holidays from date
 * - Generates AI-driven seasonal profiles with effects
 * - Manages theme transitions (e.g., auto-dark mode for winter)
 * - Coordinates visual effects (snowfall, ornaments, etc.)
 * - Provides safe-zone hints for mascot positioning
 */

import { geminiClient } from '../providers/geminiClient';
import { getSeasonalSubagent } from '../seasonalSubagent';
import { createLogger } from '../../../lib/logger';
const log = createLogger('seasonalOrchestrator');

export type SeasonId = 
  | 'winter' | 'christmas' | 'newYear' | 'valentines' 
  | 'spring' | 'easter' | 'summer' | 'fall' 
  | 'halloween' | 'thanksgiving' | 'default';

export type EffectType = 
  | 'snowfall' | 'snowPiles' | 'ornaments' | 'lights' 
  | 'fireworks' | 'hearts' | 'flowers' | 'leaves' 
  | 'pumpkins' | 'sunrays' | 'none';

export type EffectCadence = 'fast' | 'medium' | 'slow' | 'variable';

// Ornament directive types for AI Brain control
export type OrnamentType = 'ball' | 'star' | 'light' | 'snowflake' | 'sleigh';
export type OrnamentAnimation = 'twinkle' | 'sway' | 'bounce' | 'glow' | 'spin' | 'float';
export type PlacementZone = 'corners' | 'header' | 'inline' | 'overlay' | 'sidebar';

export interface OrnamentProfile {
  type: OrnamentType;
  baseHue: string;
  metallic: boolean;
  sizeRange: { min: number; max: number };
  animationSet: OrnamentAnimation[];
  pattern?: 'solid' | 'stripe' | 'dots' | 'swirl';
}

export interface PlacementRule {
  zone: PlacementZone;
  density: 'sparse' | 'medium' | 'dense';
  maxCount: number;
  avoidZones?: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface OrnamentDirective {
  profiles: OrnamentProfile[];
  placements: PlacementRule[];
  spawnRate: number; // ornaments per second
  decayRate: number; // how fast ornaments fade (0-1)
  syncWithSantaFlyover: boolean;
  globalIntensity: number; // 0-2 multiplier
}

export interface SeasonalProfile {
  seasonId: SeasonId;
  holidayName: string | null;
  isHoliday: boolean;
  
  theme: {
    forceDarkMode: boolean;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    glowColor: string;
  };
  
  effects: {
    primary: EffectType;
    secondary: EffectType | null;
    cadence: EffectCadence;
    intensity: number;
    accumulation: boolean;
    accumulationCycle: {
      formDuration: number;
      holdDuration: number;
      dissolveDuration: number;
    } | null;
  };
  
  ornaments: {
    enabled: boolean;
    types: string[];
    colors: string[];
    density: 'sparse' | 'medium' | 'dense';
  };
  
  mascotHints: {
    preferredZones: ('corners' | 'edges' | 'floating')[];
    avoidEffectZones: boolean;
    seasonalEmotes: string[];
    seasonalThoughts: string[];
  };
  
  validUntil: string;
  aiGenerated: boolean;
}

interface HolidayDefinition {
  id: SeasonId;
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  forceDarkMode: boolean;
  primaryEffect: EffectType;
}

const HOLIDAY_CALENDAR: HolidayDefinition[] = [
  { id: 'christmas', name: 'Christmas', startMonth: 12, startDay: 1, endMonth: 12, endDay: 26, forceDarkMode: true, primaryEffect: 'snowfall' },
  { id: 'newYear', name: 'New Year', startMonth: 12, startDay: 27, endMonth: 1, endDay: 3, forceDarkMode: true, primaryEffect: 'fireworks' },
  { id: 'valentines', name: "Valentine's Day", startMonth: 2, startDay: 10, endMonth: 2, endDay: 15, forceDarkMode: false, primaryEffect: 'hearts' },
  { id: 'halloween', name: 'Halloween', startMonth: 10, startDay: 25, endMonth: 11, endDay: 1, forceDarkMode: true, primaryEffect: 'pumpkins' },
  { id: 'thanksgiving', name: 'Thanksgiving', startMonth: 11, startDay: 20, endMonth: 11, endDay: 28, forceDarkMode: false, primaryEffect: 'leaves' },
];

const SEASON_DEFINITIONS: HolidayDefinition[] = [
  { id: 'winter', name: 'Winter', startMonth: 12, startDay: 21, endMonth: 3, endDay: 19, forceDarkMode: true, primaryEffect: 'snowfall' },
  { id: 'spring', name: 'Spring', startMonth: 3, startDay: 20, endMonth: 6, endDay: 20, forceDarkMode: false, primaryEffect: 'flowers' },
  { id: 'summer', name: 'Summer', startMonth: 6, startDay: 21, endMonth: 9, endDay: 21, forceDarkMode: false, primaryEffect: 'sunrays' },
  { id: 'fall', name: 'Fall', startMonth: 9, startDay: 22, endMonth: 12, endDay: 20, forceDarkMode: false, primaryEffect: 'leaves' },
];

const THEME_PALETTES: Record<SeasonId, { primary: string; secondary: string; accent: string; glow: string }> = {
  christmas: { primary: '#c41e3a', secondary: '#165b33', accent: '#ffd700', glow: '#ff6b6b' },
  winter: { primary: '#a5d8ff', secondary: '#74c0fc', accent: '#ffffff', glow: '#e7f5ff' },
  newYear: { primary: '#ffd700', secondary: '#c0c0c0', accent: '#ff6b6b', glow: '#ffd700' },
  valentines: { primary: '#ff69b4', secondary: '#ff1493', accent: '#ffffff', glow: '#ffb6c1' },
  spring: { primary: '#98fb98', secondary: '#90ee90', accent: '#ff69b4', glow: '#7fff00' },
  easter: { primary: '#e6e6fa', secondary: '#dda0dd', accent: '#98fb98', glow: '#ffb6c1' },
  summer: { primary: '#ffd700', secondary: '#ff8c00', accent: '#00bfff', glow: '#ffec4d' },
  fall: { primary: '#d2691e', secondary: '#ff8c00', accent: '#8b4513', glow: '#ffa500' },
  halloween: { primary: '#ff6600', secondary: '#800080', accent: '#00ff00', glow: '#ff6600' },
  thanksgiving: { primary: '#8b4513', secondary: '#d2691e', accent: '#ffd700', glow: '#daa520' },
  default: { primary: '#38bdf8', secondary: '#a855f7', accent: '#ffffff', glow: '#38bdf8' },
};

const SEASONAL_THOUGHTS: Record<SeasonId, string[]> = {
  christmas: [
    "The snow is so pretty today!",
    "I love the holiday lights!",
    "Hot cocoa weather!",
    "Feeling festive!",
  ],
  winter: [
    "Brrr, it's chilly!",
    "Perfect sweater weather",
    "The snow sparkles!",
    "Cozy vibes today",
  ],
  newYear: [
    "New year, new goals!",
    "Fresh start energy!",
    "Cheers to success!",
    "Big things ahead!",
  ],
  valentines: [
    "Love is in the air!",
    "Spreading good vibes",
    "Heart eyes today!",
    "Feeling the love!",
  ],
  spring: [
    "Everything is blooming!",
    "Fresh spring air!",
    "New beginnings!",
    "Nature is waking up!",
  ],
  easter: [
    "Spring has sprung!",
    "Pastel vibes today",
    "Hop to it!",
    "Sweet spring day!",
  ],
  summer: [
    "Sunshine mode on!",
    "Beach vibes!",
    "Feeling sunny!",
    "Summer energy!",
  ],
  fall: [
    "Pumpkin spice time!",
    "Love the fall colors",
    "Cozy autumn feels",
    "Sweater weather!",
  ],
  halloween: [
    "Spooky season!",
    "Boo! Just kidding!",
    "Trick or treat!",
    "Getting spooky!",
  ],
  thanksgiving: [
    "Grateful today!",
    "Thankful vibes!",
    "Feast mode on!",
    "Counting blessings",
  ],
  default: [
    "Great day to work!",
    "Let's be productive!",
    "I'm here to help!",
    "What's the plan?",
  ],
};

// Ornament directives for each season - AI Brain orchestrated
const SEASONAL_ORNAMENT_DIRECTIVES: Record<SeasonId, OrnamentDirective> = {
  christmas: {
    profiles: [
      { type: 'ball', baseHue: '#c41e3a', metallic: true, sizeRange: { min: 24, max: 36 }, animationSet: ['twinkle', 'sway'], pattern: 'stripe' },
      { type: 'ball', baseHue: '#165b33', metallic: true, sizeRange: { min: 22, max: 32 }, animationSet: ['twinkle', 'float'], pattern: 'dots' },
      { type: 'star', baseHue: '#ffd700', metallic: true, sizeRange: { min: 20, max: 32 }, animationSet: ['twinkle', 'glow'] },
      { type: 'light', baseHue: '#ff4444', metallic: false, sizeRange: { min: 12, max: 18 }, animationSet: ['twinkle', 'glow'] },
      { type: 'snowflake', baseHue: '#ffffff', metallic: false, sizeRange: { min: 10, max: 22 }, animationSet: ['float'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 6 },
      { zone: 'header', density: 'sparse', maxCount: 8 },
    ],
    spawnRate: 0.08,
    decayRate: 0.03,
    syncWithSantaFlyover: true,
    globalIntensity: 0.55,
  },
  winter: {
    profiles: [
      { type: 'snowflake', baseHue: '#ffffff', metallic: false, sizeRange: { min: 10, max: 20 }, animationSet: ['float'] },
      { type: 'star', baseHue: '#e7f5ff', metallic: true, sizeRange: { min: 16, max: 28 }, animationSet: ['twinkle', 'glow'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 4 },
    ],
    spawnRate: 0.05,
    decayRate: 0.04,
    syncWithSantaFlyover: false,
    globalIntensity: 0.4,
  },
  newYear: {
    profiles: [
      { type: 'star', baseHue: '#ffd700', metallic: true, sizeRange: { min: 22, max: 36 }, animationSet: ['twinkle', 'glow'] },
      { type: 'star', baseHue: '#c0c0c0', metallic: true, sizeRange: { min: 18, max: 30 }, animationSet: ['twinkle'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 5 },
      { zone: 'header', density: 'sparse', maxCount: 4 },
    ],
    spawnRate: 0.1,
    decayRate: 0.05,
    syncWithSantaFlyover: false,
    globalIntensity: 0.5,
  },
  valentines: {
    profiles: [
      { type: 'ball', baseHue: '#ff69b4', metallic: true, sizeRange: { min: 22, max: 35 }, animationSet: ['float', 'twinkle'], pattern: 'dots' },
      { type: 'ball', baseHue: '#ff1493', metallic: true, sizeRange: { min: 25, max: 38 }, animationSet: ['bounce', 'glow'], pattern: 'solid' },
      { type: 'star', baseHue: '#ffb6c1', metallic: false, sizeRange: { min: 20, max: 32 }, animationSet: ['twinkle', 'float'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 10 },
    ],
    spawnRate: 0.15,
    decayRate: 0.02,
    syncWithSantaFlyover: false,
    globalIntensity: 0.6,
  },
  spring: {
    profiles: [
      { type: 'ball', baseHue: '#98fb98', metallic: false, sizeRange: { min: 20, max: 32 }, animationSet: ['float', 'sway'], pattern: 'dots' },
      { type: 'star', baseHue: '#ff69b4', metallic: false, sizeRange: { min: 18, max: 28 }, animationSet: ['twinkle', 'float'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 8 },
    ],
    spawnRate: 0.1,
    decayRate: 0.02,
    syncWithSantaFlyover: false,
    globalIntensity: 0.5,
  },
  easter: {
    profiles: [
      { type: 'ball', baseHue: '#e6e6fa', metallic: false, sizeRange: { min: 22, max: 35 }, animationSet: ['bounce', 'float'], pattern: 'stripe' },
      { type: 'ball', baseHue: '#dda0dd', metallic: false, sizeRange: { min: 20, max: 32 }, animationSet: ['sway', 'twinkle'], pattern: 'dots' },
      { type: 'ball', baseHue: '#98fb98', metallic: false, sizeRange: { min: 18, max: 30 }, animationSet: ['bounce', 'float'], pattern: 'solid' },
    ],
    placements: [
      { zone: 'corners', density: 'medium', maxCount: 12 },
    ],
    spawnRate: 0.15,
    decayRate: 0.02,
    syncWithSantaFlyover: false,
    globalIntensity: 0.6,
  },
  summer: {
    profiles: [
      { type: 'star', baseHue: '#ffd700', metallic: true, sizeRange: { min: 25, max: 40 }, animationSet: ['glow', 'twinkle'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 6 },
    ],
    spawnRate: 0.05,
    decayRate: 0.01,
    syncWithSantaFlyover: false,
    globalIntensity: 0.4,
  },
  fall: {
    profiles: [
      { type: 'ball', baseHue: '#d2691e', metallic: true, sizeRange: { min: 22, max: 36 }, animationSet: ['sway', 'float'], pattern: 'solid' },
      { type: 'ball', baseHue: '#ff8c00', metallic: true, sizeRange: { min: 20, max: 34 }, animationSet: ['bounce', 'sway'], pattern: 'stripe' },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 10 },
    ],
    spawnRate: 0.1,
    decayRate: 0.02,
    syncWithSantaFlyover: false,
    globalIntensity: 0.5,
  },
  halloween: {
    profiles: [
      { type: 'ball', baseHue: '#ff6600', metallic: true, sizeRange: { min: 28, max: 45 }, animationSet: ['glow', 'bounce'], pattern: 'swirl' },
      { type: 'ball', baseHue: '#800080', metallic: true, sizeRange: { min: 25, max: 40 }, animationSet: ['twinkle', 'float'], pattern: 'dots' },
      { type: 'star', baseHue: '#00ff00', metallic: false, sizeRange: { min: 20, max: 35 }, animationSet: ['glow', 'spin'] },
    ],
    placements: [
      { zone: 'corners', density: 'medium', maxCount: 14 },
    ],
    spawnRate: 0.2,
    decayRate: 0.025,
    syncWithSantaFlyover: false,
    globalIntensity: 0.8,
  },
  thanksgiving: {
    profiles: [
      { type: 'ball', baseHue: '#8b4513', metallic: true, sizeRange: { min: 24, max: 38 }, animationSet: ['sway', 'float'], pattern: 'solid' },
      { type: 'ball', baseHue: '#d2691e', metallic: true, sizeRange: { min: 22, max: 36 }, animationSet: ['bounce', 'sway'], pattern: 'stripe' },
      { type: 'star', baseHue: '#ffd700', metallic: true, sizeRange: { min: 22, max: 35 }, animationSet: ['twinkle', 'glow'] },
    ],
    placements: [
      { zone: 'corners', density: 'sparse', maxCount: 10 },
    ],
    spawnRate: 0.12,
    decayRate: 0.02,
    syncWithSantaFlyover: false,
    globalIntensity: 0.6,
  },
  default: {
    profiles: [],
    placements: [],
    spawnRate: 0,
    decayRate: 0,
    syncWithSantaFlyover: false,
    globalIntensity: 0,
  },
};

// Get ornament directive for a season
export function getOrnamentDirective(seasonId: SeasonId): OrnamentDirective {
  // Check if seasonal theming is disabled via AI Brain orchestration
  const subagent = getSeasonalSubagent();
  if (subagent.isSeasonalDisabled()) {
    return SEASONAL_ORNAMENT_DIRECTIVES.default;
  }
  return SEASONAL_ORNAMENT_DIRECTIVES[seasonId] || SEASONAL_ORNAMENT_DIRECTIVES.default;
}

// Update ornament directive with intensity multiplier
export function getModifiedOrnamentDirective(seasonId: SeasonId): OrnamentDirective {
  // Check if seasonal theming is disabled via AI Brain orchestration
  const subagent = getSeasonalSubagent();
  if (subagent.isSeasonalDisabled()) {
    return SEASONAL_ORNAMENT_DIRECTIVES.default;
  }
  
  const base = getOrnamentDirective(seasonId);
  const multiplier = supportOverrides.intensityMultiplier || 1.0;
  
  return {
    ...base,
    globalIntensity: base.globalIntensity * multiplier,
    spawnRate: base.spawnRate * multiplier,
    placements: base.placements.map(p => ({
      ...p,
      maxCount: Math.round(p.maxCount * multiplier),
    })),
  };
}

function isDateInRange(date: Date, startMonth: number, startDay: number, endMonth: number, endDay: number): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  if (startMonth <= endMonth) {
    if (month < startMonth || month > endMonth) return false;
    if (month === startMonth && day < startDay) return false;
    if (month === endMonth && day > endDay) return false;
    return true;
  } else {
    if (month >= startMonth) {
      if (month === startMonth && day < startDay) return false;
      return true;
    }
    if (month <= endMonth) {
      if (month === endMonth && day > endDay) return false;
      return true;
    }
    return false;
  }
}

function detectCurrentHoliday(date: Date): HolidayDefinition | null {
  for (const holiday of HOLIDAY_CALENDAR) {
    if (isDateInRange(date, holiday.startMonth, holiday.startDay, holiday.endMonth, holiday.endDay)) {
      return holiday;
    }
  }
  return null;
}

function detectCurrentSeason(date: Date): HolidayDefinition {
  for (const season of SEASON_DEFINITIONS) {
    if (isDateInRange(date, season.startMonth, season.startDay, season.endMonth, season.endDay)) {
      return season;
    }
  }
  return SEASON_DEFINITIONS[0];
}

export async function generateSeasonalProfile(workspaceId?: string): Promise<SeasonalProfile> {
  // SINGLE CONTROL POINT: Check server/config/seasonalToggle.ts to enable/disable
  // Import dynamically to avoid circular dependencies
  let seasonalEnabled = false;
  try {
    const { SEASONAL_ENABLED } = await import('../../../config/seasonalToggle');
    seasonalEnabled = SEASONAL_ENABLED;
  } catch {
    // If toggle file doesn't exist, default to disabled
    seasonalEnabled = false;
  }
  
  // Check if seasonal theming is disabled via orchestration or toggle
  const subagent = getSeasonalSubagent();
  if (!seasonalEnabled || subagent.isSeasonalDisabled()) {
    log.info('[SeasonalOrchestrator] Seasonal theming disabled - returning default profile');
    return {
      seasonId: 'default',
      holidayName: null,
      isHoliday: false,
      theme: {
        forceDarkMode: false,
        primaryColor: THEME_PALETTES.default.primary,
        secondaryColor: THEME_PALETTES.default.secondary,
        accentColor: THEME_PALETTES.default.accent,
        glowColor: THEME_PALETTES.default.glow,
      },
      effects: {
        primary: 'none',
        secondary: null,
        cadence: 'medium',
        intensity: 0,
        accumulation: false,
        accumulationCycle: null,
      },
      ornaments: {
        enabled: false,
        types: [],
        colors: [],
        density: 'sparse',
      },
      mascotHints: {
        preferredZones: ['corners'],
        avoidEffectZones: true,
        seasonalEmotes: [],
        seasonalThoughts: SEASONAL_THOUGHTS.default,
      },
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      aiGenerated: false,
    };
  }
  
  const now = new Date();
  const holiday = detectCurrentHoliday(now);
  const season = detectCurrentSeason(now);
  
  const activeTheme = holiday || season;
  const seasonId = activeTheme.id;
  const palette = THEME_PALETTES[seasonId];
  const thoughts = SEASONAL_THOUGHTS[seasonId];
  
  const needsSnowAccumulation = seasonId === 'christmas' || seasonId === 'winter';
  
  const profile: SeasonalProfile = {
    seasonId,
    holidayName: holiday?.name || null,
    isHoliday: !!holiday,
    
    theme: {
      forceDarkMode: activeTheme.forceDarkMode,
      primaryColor: palette.primary,
      secondaryColor: palette.secondary,
      accentColor: palette.accent,
      glowColor: palette.glow,
    },
    
    effects: {
      primary: activeTheme.primaryEffect,
      secondary: needsSnowAccumulation ? 'snowPiles' : null,
      cadence: 'variable',
      intensity: holiday ? 0.8 : 0.5,
      accumulation: needsSnowAccumulation,
      accumulationCycle: needsSnowAccumulation ? {
        formDuration: 15000,
        holdDuration: 8000,
        dissolveDuration: 5000,
      } : null,
    },
    
    ornaments: {
      enabled: !!holiday,
      types: getOrnamentTypes(seasonId),
      colors: [palette.primary, palette.secondary, palette.accent],
      density: holiday ? 'medium' : 'sparse',
    },
    
    mascotHints: {
      preferredZones: ['corners', 'edges'],
      avoidEffectZones: true,
      seasonalEmotes: getSeasonalEmotes(seasonId),
      seasonalThoughts: thoughts,
    },
    
    validUntil: getValidUntil(now, holiday, season),
    aiGenerated: false,
  };
  
  try {
    const aiEnhanced = await enhanceWithAI(profile, now, workspaceId);
    return { ...profile, ...aiEnhanced, aiGenerated: true };
  } catch (error) {
    log.info('[SeasonalOrchestrator] AI enhancement skipped:', error);
    return profile;
  }
}

function getOrnamentTypes(seasonId: SeasonId): string[] {
  switch (seasonId) {
    case 'christmas': return ['star', 'ball', 'candy_cane', 'gift', 'bell'];
    case 'halloween': return ['pumpkin', 'bat', 'ghost', 'spider'];
    case 'valentines': return ['heart', 'rose', 'cupid'];
    case 'thanksgiving': return ['leaf', 'turkey', 'cornucopia'];
    case 'easter': return ['egg', 'bunny', 'flower'];
    case 'newYear': return ['star', 'clock', 'champagne'];
    default: return [];
  }
}

function getSeasonalEmotes(seasonId: SeasonId): string[] {
  switch (seasonId) {
    case 'christmas': return ['celebration', 'excited', 'playful', 'greeting'];
    case 'winter': return ['curious', 'idle', 'playful'];
    case 'halloween': return ['excited', 'playful', 'curious'];
    case 'valentines': return ['shy', 'excited', 'playful'];
    default: return ['idle', 'curious', 'helpful'];
  }
}

function getValidUntil(now: Date, holiday: HolidayDefinition | null, season: HolidayDefinition): string {
  const endDate = new Date(now);
  
  if (holiday) {
    endDate.setMonth(holiday.endMonth - 1);
    endDate.setDate(holiday.endDay);
    if (endDate < now) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
  } else {
    endDate.setMonth(season.endMonth - 1);
    endDate.setDate(season.endDay);
    if (endDate < now) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
  }
  
  return endDate.toISOString();
}

async function enhanceWithAI(profile: SeasonalProfile, now: Date, workspaceId?: string): Promise<Partial<SeasonalProfile>> {
  const prompt = `You are the CoAIleague seasonal mood AI. Given the current date ${now.toLocaleDateString()} and season "${profile.seasonId}", suggest:
1. One additional seasonal thought for the mascot (max 25 chars)
2. Optimal effect intensity (0.3-1.0) based on time of day
3. Should ornaments be more visible? (true/false)

Respond in JSON: { "thought": "...", "intensity": 0.X, "moreOrnaments": true/false }`;

  try {
    const result = await geminiClient.generate({
      workspaceId,
      featureKey: 'seasonal_orchestrator',
      systemPrompt: 'You are the CoAIleague seasonal mood AI assistant. Respond only with valid JSON.',
      userMessage: prompt,
      maxTokens: 150,
      temperature: 0.7,
    });
    const text = result.text;
    if (text) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          effects: {
            ...profile.effects,
            intensity: Math.max(0.3, Math.min(1.0, parsed.intensity || profile.effects.intensity)),
          },
          ornaments: {
            ...profile.ornaments,
            density: parsed.moreOrnaments ? 'dense' : profile.ornaments.density,
          },
          mascotHints: {
            ...profile.mascotHints,
            seasonalThoughts: parsed.thought 
              ? [...profile.mascotHints.seasonalThoughts, parsed.thought]
              : profile.mascotHints.seasonalThoughts,
          },
        };
      }
    }
  } catch (e) {
    // Silent fail, use base profile
  }
  
  return {};
}

export function getCurrentSeasonId(): SeasonId {
  // Check if seasonal theming is disabled via AI Brain orchestration
  const subagent = getSeasonalSubagent();
  if (subagent.isSeasonalDisabled()) {
    return 'default';
  }
  
  const now = new Date();
  const holiday = detectCurrentHoliday(now);
  if (holiday) return holiday.id;
  return detectCurrentSeason(now).id;
}

export function shouldForceDarkMode(): boolean {
  // Check if seasonal theming is disabled via AI Brain orchestration
  const subagent = getSeasonalSubagent();
  if (subagent.isSeasonalDisabled()) {
    return false;
  }
  
  const now = new Date();
  const holiday = detectCurrentHoliday(now);
  if (holiday) return holiday.forceDarkMode;
  return detectCurrentSeason(now).forceDarkMode;
}

// AI Brain Health Check System for Seasonal Effects
export interface SeasonalHealthCheck {
  status: 'healthy' | 'degraded' | 'missing_effects';
  seasonId: SeasonId;
  timestamp: string;
  activeManagers: string[];
  missingEffects: string[];
  recommendations: string[];
  supportActions: string[];
}

// Expected effects for each season
const EXPECTED_EFFECTS: Record<SeasonId, string[]> = {
  christmas: ['snowfall', 'ornaments', 'lights', 'santaFlyover', 'snowPiles', 'darkMode'],
  winter: ['snowfall', 'snowPiles', 'darkMode'],
  newYear: ['fireworks', 'ornaments', 'darkMode'],
  valentines: ['hearts', 'ornaments'],
  spring: ['flowers', 'ornaments'],
  easter: ['flowers', 'ornaments'],
  summer: ['sunrays'],
  fall: ['leaves', 'ornaments'],
  halloween: ['pumpkins', 'ornaments', 'darkMode'],
  thanksgiving: ['leaves', 'ornaments'],
  default: [],
};

// Active seasonal managers registry
let activeManagers: Set<string> = new Set();

export function registerSeasonalManager(managerId: string) {
  activeManagers.add(managerId);
  log.info(`[SeasonalOrchestrator] Registered manager: ${managerId}`);
}

export function unregisterSeasonalManager(managerId: string) {
  activeManagers.delete(managerId);
  log.info(`[SeasonalOrchestrator] Unregistered manager: ${managerId}`);
}

export function getActiveManagers(): string[] {
  return Array.from(activeManagers);
}

export async function runSeasonalHealthCheck(): Promise<SeasonalHealthCheck> {
  const now = new Date();
  const seasonId = getCurrentSeasonId();
  const expected = EXPECTED_EFFECTS[seasonId] || [];
  const active = Array.from(activeManagers);
  
  // Check for missing effects
  const missing = expected.filter(effect => !active.includes(effect));
  
  const recommendations: string[] = [];
  const supportActions: string[] = [];
  
  if (missing.length > 0) {
    recommendations.push(`Missing ${missing.length} seasonal effect(s): ${missing.join(', ')}`);
    supportActions.push('trigger_seasonal_refresh');
    
    // Specific recommendations based on what's missing
    if (missing.includes('santaFlyover') && seasonId === 'christmas') {
      recommendations.push('Santa flyover effect not active - verify SeasonalEffectsLayer is mounted');
    }
    if (missing.includes('ornaments')) {
      recommendations.push('Corner ornaments not rendering - check ornament density configuration');
    }
    if (missing.includes('lights') && seasonId === 'christmas') {
      recommendations.push('Holiday lights not active - verify HolidayLights component is enabled');
    }
    if (missing.includes('snowfall')) {
      recommendations.push('Snowfall engine not running - check SnowfallEngine lazy loading');
    }
  }
  
  // Determine overall status
  let status: 'healthy' | 'degraded' | 'missing_effects';
  if (missing.length === 0) {
    status = 'healthy';
  } else if (missing.length < expected.length / 2) {
    status = 'degraded';
  } else {
    status = 'missing_effects';
  }
  
  const healthCheck: SeasonalHealthCheck = {
    status,
    seasonId,
    timestamp: now.toISOString(),
    activeManagers: active,
    missingEffects: missing,
    recommendations,
    supportActions,
  };
  
  log.info(`[SeasonalOrchestrator] Health check: ${status}, missing: ${missing.length}/${expected.length}`);
  
  return healthCheck;
}

// Support Command Console Actions
export interface SeasonalCommand {
  action: 'refresh' | 'force_holiday' | 'clear_holiday' | 'toggle_effect' | 'increase_intensity' | 'decrease_intensity' | 'force_disable' | 'force_enable';
  params?: Record<string, string | number | boolean>;
}

export interface SeasonalCommandResult {
  success: boolean;
  message: string;
  newState?: Partial<SeasonalProfile>;
}

// In-memory state for support overrides
let supportOverrides: {
  forceHoliday?: SeasonId;
  disabledEffects?: Set<string>;
  intensityMultiplier?: number;
} = {};

export async function executeSeasonalCommand(command: SeasonalCommand): Promise<SeasonalCommandResult> {
  log.info(`[SeasonalOrchestrator] Executing command: ${command.action}`, command.params);
  
  switch (command.action) {
    case 'refresh':
      // Clear overrides and regenerate profile
      supportOverrides = {};
      const refreshedProfile = await generateSeasonalProfile();
      return {
        success: true,
        message: `Seasonal profile refreshed for ${refreshedProfile.seasonId}`,
        newState: refreshedProfile,
      };
      
    case 'force_holiday':
      const holidayId = command.params?.holidayId as SeasonId;
      if (!holidayId || !THEME_PALETTES[holidayId]) {
        return { success: false, message: `Invalid holiday ID: ${holidayId}` };
      }
      supportOverrides.forceHoliday = holidayId;
      return {
        success: true,
        message: `Forced holiday: ${holidayId}`,
        newState: { seasonId: holidayId },
      };
      
    case 'clear_holiday':
      supportOverrides.forceHoliday = undefined;
      return {
        success: true,
        message: 'Holiday override cleared',
      };
      
    case 'toggle_effect':
      const effectName = command.params?.effect as string;
      if (!effectName) {
        return { success: false, message: 'Effect name required' };
      }
      if (!supportOverrides.disabledEffects) {
        supportOverrides.disabledEffects = new Set();
      }
      if (supportOverrides.disabledEffects.has(effectName)) {
        supportOverrides.disabledEffects.delete(effectName);
        return { success: true, message: `Effect enabled: ${effectName}` };
      } else {
        supportOverrides.disabledEffects.add(effectName);
        return { success: true, message: `Effect disabled: ${effectName}` };
      }
      
    case 'increase_intensity':
      supportOverrides.intensityMultiplier = Math.min(2.0, (supportOverrides.intensityMultiplier || 1.0) + 0.25);
      return {
        success: true,
        message: `Intensity increased to ${supportOverrides.intensityMultiplier}x`,
      };
      
    case 'decrease_intensity':
      supportOverrides.intensityMultiplier = Math.max(0.25, (supportOverrides.intensityMultiplier || 1.0) - 0.25);
      return {
        success: true,
        message: `Intensity decreased to ${supportOverrides.intensityMultiplier}x`,
      };
    
    case 'force_disable':
      // Force disable all seasonal theming via AI Brain orchestration
      try {
        const subagent = getSeasonalSubagent();
        const reason = command.params?.reason as string || 'Trinity/AI Brain orchestration override';
        const result = await subagent.forceDeactivateTheme(reason);
        supportOverrides = {}; // Clear all overrides
        return {
          success: result.success,
          message: result.message,
          newState: { seasonId: 'default', isHoliday: false },
        };
      } catch (error) {
        return { success: false, message: `Failed to force disable: ${(error as Error).message}` };
      }
    
    case 'force_enable':
      // Re-enable seasonal theming via AI Brain orchestration
      try {
        const subagent = getSeasonalSubagent();
        const result = await subagent.enableSeasonalTheming();
        return {
          success: result.success,
          message: result.message,
        };
      } catch (error) {
        return { success: false, message: `Failed to force enable: ${(error as Error).message}` };
      }
      
    default:
      return { success: false, message: `Unknown command: ${command.action}` };
  }
}

export function getSupportOverrides() {
  return {
    forceHoliday: supportOverrides.forceHoliday,
    disabledEffects: supportOverrides.disabledEffects ? Array.from(supportOverrides.disabledEffects) : [],
    intensityMultiplier: supportOverrides.intensityMultiplier || 1.0,
  };
}

// Generate AI-powered health report
export async function generateAIHealthReport(): Promise<string> {
  const healthCheck = await runSeasonalHealthCheck();
  
  if (healthCheck.status === 'healthy') {
    return `Seasonal system healthy. ${healthCheck.activeManagers.length} managers active for ${healthCheck.seasonId}.`;
  }
  
  try {
    const prompt = `The seasonal effects system has ${healthCheck.missingEffects.length} missing effects for ${healthCheck.seasonId}: ${healthCheck.missingEffects.join(', ')}.
Active managers: ${healthCheck.activeManagers.join(', ') || 'none'}.
Generate a brief diagnostic message (max 100 chars) explaining the issue.`;

    const result = await geminiClient.generate({
      workspaceId: undefined, // Platform-level health check, no workspace billing
      featureKey: 'seasonal_health',
      systemPrompt: 'You are a diagnostic AI. Provide brief, actionable status messages.',
      userMessage: prompt,
      maxTokens: 50,
      temperature: 0.3,
    });
    
    return result.text || `${healthCheck.status}: ${healthCheck.missingEffects.length} effects missing`;
  } catch (e) {
    return `${healthCheck.status}: ${healthCheck.missingEffects.join(', ')} not active`;
  }
}
