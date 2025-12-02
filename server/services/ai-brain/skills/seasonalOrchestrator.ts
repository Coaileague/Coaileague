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

export type SeasonId = 
  | 'winter' | 'christmas' | 'newYear' | 'valentines' 
  | 'spring' | 'easter' | 'summer' | 'fall' 
  | 'halloween' | 'thanksgiving' | 'default';

export type EffectType = 
  | 'snowfall' | 'snowPiles' | 'ornaments' | 'lights' 
  | 'fireworks' | 'hearts' | 'flowers' | 'leaves' 
  | 'pumpkins' | 'sunrays' | 'none';

export type EffectCadence = 'fast' | 'medium' | 'slow' | 'variable';

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
    const aiEnhanced = await enhanceWithAI(profile, now);
    return { ...profile, ...aiEnhanced, aiGenerated: true };
  } catch (error) {
    console.log('[SeasonalOrchestrator] AI enhancement skipped:', error);
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

async function enhanceWithAI(profile: SeasonalProfile, now: Date): Promise<Partial<SeasonalProfile>> {
  const prompt = `You are the CoAIleague seasonal mood AI. Given the current date ${now.toLocaleDateString()} and season "${profile.seasonId}", suggest:
1. One additional seasonal thought for the mascot (max 25 chars)
2. Optimal effect intensity (0.3-1.0) based on time of day
3. Should ornaments be more visible? (true/false)

Respond in JSON: { "thought": "...", "intensity": 0.X, "moreOrnaments": true/false }`;

  try {
    const result = await geminiClient.generate({
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
  const now = new Date();
  const holiday = detectCurrentHoliday(now);
  if (holiday) return holiday.id;
  return detectCurrentSeason(now).id;
}

export function shouldForceDarkMode(): boolean {
  const now = new Date();
  const holiday = detectCurrentHoliday(now);
  if (holiday) return holiday.forceDarkMode;
  return detectCurrentSeason(now).forceDarkMode;
}
