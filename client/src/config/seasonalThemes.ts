/**
 * SeasonalThemeRegistry - Google Doodle-style seasonal theming system
 * 
 * Maps calendar dates to visual themes with:
 * - Color palettes
 * - Decorative overlay effects
 * - Animation presets
 * - Particle/decoration assets
 */

export type SeasonalTheme = 
  | 'winter'      // Dec 21 - Mar 19 (default winter)
  | 'christmas'   // Dec 1 - Dec 26
  | 'newYear'     // Dec 27 - Jan 3
  | 'valentines'  // Feb 10 - Feb 15
  | 'spring'      // Mar 20 - Jun 20
  | 'easter'      // Easter weekend (calculated)
  | 'summer'      // Jun 21 - Sep 21
  | 'fall'        // Sep 22 - Dec 20
  | 'halloween'   // Oct 25 - Nov 1
  | 'thanksgiving' // Thanksgiving week
  | 'default';    // Fallback

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  particles: string[];
}

export interface ThemeDecorations {
  type: 'lights' | 'leaves' | 'flowers' | 'hearts' | 'snowflakes' | 'fireworks' | 'pumpkins' | 'sunrays' | 'none';
  colors: string[];
  animationSpeed: 'slow' | 'medium' | 'fast';
  density: 'sparse' | 'medium' | 'dense';
}

export interface SeasonalThemeConfig {
  id: SeasonalTheme;
  name: string;
  colors: ThemeColors;
  decorations: ThemeDecorations;
  letterEffects: {
    gradient: string[];
    shadow: string;
    animation: 'wave' | 'bounce' | 'glow' | 'shimmer' | 'none';
  };
  specialMessage?: string;
}

export const SEASONAL_THEMES: Record<SeasonalTheme, SeasonalThemeConfig> = {
  christmas: {
    id: 'christmas',
    name: 'Christmas',
    colors: {
      primary: '#c41e3a',
      secondary: '#165b33',
      accent: '#ffd700',
      glow: '#ff6b6b',
      particles: ['#ff0000', '#00ff00', '#ffd700', '#ffffff', '#ff69b4', '#00bfff']
    },
    decorations: {
      type: 'lights',
      colors: ['#ff0000', '#00ff00', '#ffd700', '#00bfff', '#ff69b4', '#ff8c00'],
      animationSpeed: 'medium',
      density: 'dense'
    },
    letterEffects: {
      gradient: ['#165b33', '#1e8449', '#27ae60'],
      shadow: '0 0 20px rgba(255, 215, 0, 0.5)',
      animation: 'glow'
    },
    specialMessage: 'Happy Holidays!'
  },
  
  winter: {
    id: 'winter',
    name: 'Winter',
    colors: {
      primary: '#a5d8ff',
      secondary: '#74c0fc',
      accent: '#ffffff',
      glow: '#e7f5ff',
      particles: ['#ffffff', '#e7f5ff', '#a5d8ff', '#74c0fc']
    },
    decorations: {
      type: 'snowflakes',
      colors: ['#ffffff', '#e7f5ff', '#a5d8ff'],
      animationSpeed: 'slow',
      density: 'medium'
    },
    letterEffects: {
      gradient: ['#0ea5e9', '#38bdf8', '#7dd3fc'],
      shadow: '0 0 15px rgba(125, 211, 252, 0.4)',
      animation: 'shimmer'
    }
  },
  
  newYear: {
    id: 'newYear',
    name: 'New Year',
    colors: {
      primary: '#ffd700',
      secondary: '#c0c0c0',
      accent: '#ff6b6b',
      glow: '#ffd700',
      particles: ['#ffd700', '#ff6b6b', '#ffffff', '#c0c0c0', '#ff69b4']
    },
    decorations: {
      type: 'fireworks',
      colors: ['#ffd700', '#ff6b6b', '#00ff00', '#00bfff', '#ff69b4'],
      animationSpeed: 'fast',
      density: 'dense'
    },
    letterEffects: {
      gradient: ['#ffd700', '#ffec4d', '#fff59d'],
      shadow: '0 0 25px rgba(255, 215, 0, 0.6)',
      animation: 'bounce'
    },
    specialMessage: 'Happy New Year!'
  },
  
  valentines: {
    id: 'valentines',
    name: 'Valentine\'s Day',
    colors: {
      primary: '#ff69b4',
      secondary: '#ff1493',
      accent: '#ffffff',
      glow: '#ffb6c1',
      particles: ['#ff69b4', '#ff1493', '#ff6b6b', '#ffffff', '#ffc0cb']
    },
    decorations: {
      type: 'hearts',
      colors: ['#ff69b4', '#ff1493', '#ff6b6b', '#ffc0cb'],
      animationSpeed: 'slow',
      density: 'medium'
    },
    letterEffects: {
      gradient: ['#ff1493', '#ff69b4', '#ffb6c1'],
      shadow: '0 0 20px rgba(255, 105, 180, 0.5)',
      animation: 'wave'
    },
    specialMessage: 'Happy Valentine\'s Day!'
  },
  
  spring: {
    id: 'spring',
    name: 'Spring',
    colors: {
      primary: '#22c55e',
      secondary: '#84cc16',
      accent: '#fbbf24',
      glow: '#bbf7d0',
      particles: ['#22c55e', '#84cc16', '#fbbf24', '#ff69b4', '#ffffff']
    },
    decorations: {
      type: 'flowers',
      colors: ['#ff69b4', '#fbbf24', '#22c55e', '#ffffff', '#dda0dd'],
      animationSpeed: 'slow',
      density: 'medium'
    },
    letterEffects: {
      gradient: ['#22c55e', '#4ade80', '#86efac'],
      shadow: '0 0 15px rgba(34, 197, 94, 0.4)',
      animation: 'wave'
    }
  },
  
  easter: {
    id: 'easter',
    name: 'Easter',
    colors: {
      primary: '#e879f9',
      secondary: '#fbbf24',
      accent: '#38bdf8',
      glow: '#f5d0fe',
      particles: ['#e879f9', '#fbbf24', '#38bdf8', '#22c55e', '#ffffff']
    },
    decorations: {
      type: 'flowers',
      colors: ['#e879f9', '#fbbf24', '#38bdf8', '#22c55e'],
      animationSpeed: 'medium',
      density: 'medium'
    },
    letterEffects: {
      gradient: ['#e879f9', '#f0abfc', '#f5d0fe'],
      shadow: '0 0 18px rgba(232, 121, 249, 0.4)',
      animation: 'bounce'
    },
    specialMessage: 'Happy Easter!'
  },
  
  summer: {
    id: 'summer',
    name: 'Summer',
    colors: {
      primary: '#f59e0b',
      secondary: '#06b6d4',
      accent: '#fbbf24',
      glow: '#fef3c7',
      particles: ['#f59e0b', '#06b6d4', '#fbbf24', '#ffffff']
    },
    decorations: {
      type: 'sunrays',
      colors: ['#f59e0b', '#fbbf24', '#fef3c7'],
      animationSpeed: 'slow',
      density: 'sparse'
    },
    letterEffects: {
      gradient: ['#f59e0b', '#fbbf24', '#fcd34d'],
      shadow: '0 0 20px rgba(251, 191, 36, 0.5)',
      animation: 'shimmer'
    }
  },
  
  fall: {
    id: 'fall',
    name: 'Fall',
    colors: {
      primary: '#ea580c',
      secondary: '#dc2626',
      accent: '#fbbf24',
      glow: '#fed7aa',
      particles: ['#ea580c', '#dc2626', '#fbbf24', '#78350f', '#f59e0b']
    },
    decorations: {
      type: 'leaves',
      colors: ['#ea580c', '#dc2626', '#fbbf24', '#78350f', '#f59e0b'],
      animationSpeed: 'slow',
      density: 'medium'
    },
    letterEffects: {
      gradient: ['#ea580c', '#f97316', '#fb923c'],
      shadow: '0 0 15px rgba(234, 88, 12, 0.4)',
      animation: 'wave'
    }
  },
  
  halloween: {
    id: 'halloween',
    name: 'Halloween',
    colors: {
      primary: '#f97316',
      secondary: '#7c3aed',
      accent: '#22c55e',
      glow: '#fdba74',
      particles: ['#f97316', '#7c3aed', '#22c55e', '#000000', '#ffffff']
    },
    decorations: {
      type: 'pumpkins',
      colors: ['#f97316', '#7c3aed', '#22c55e'],
      animationSpeed: 'medium',
      density: 'medium'
    },
    letterEffects: {
      gradient: ['#f97316', '#fb923c', '#fdba74'],
      shadow: '0 0 25px rgba(124, 58, 237, 0.5)',
      animation: 'glow'
    },
    specialMessage: 'Happy Halloween!'
  },
  
  thanksgiving: {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    colors: {
      primary: '#92400e',
      secondary: '#ea580c',
      accent: '#fbbf24',
      glow: '#fde68a',
      particles: ['#92400e', '#ea580c', '#fbbf24', '#78350f']
    },
    decorations: {
      type: 'leaves',
      colors: ['#92400e', '#ea580c', '#fbbf24', '#78350f'],
      animationSpeed: 'slow',
      density: 'sparse'
    },
    letterEffects: {
      gradient: ['#92400e', '#b45309', '#d97706'],
      shadow: '0 0 15px rgba(251, 191, 36, 0.4)',
      animation: 'shimmer'
    },
    specialMessage: 'Happy Thanksgiving!'
  },
  
  default: {
    id: 'default',
    name: 'CoAIleague',
    colors: {
      primary: '#0ea5e9',
      secondary: '#06b6d4',
      accent: '#22d3ee',
      glow: '#7dd3fc',
      particles: ['#0ea5e9', '#06b6d4', '#22d3ee', '#38bdf8']
    },
    decorations: {
      type: 'none',
      colors: [],
      animationSpeed: 'medium',
      density: 'sparse'
    },
    letterEffects: {
      gradient: ['#0d9488', '#14b8a6', '#0ea5e9'],
      shadow: '0 0 15px rgba(14, 165, 233, 0.4)',
      animation: 'shimmer'
    }
  }
};

/**
 * Determines the current seasonal theme based on date
 */
export function getCurrentSeasonalTheme(date: Date = new Date()): SeasonalTheme {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // Christmas: Dec 1-26
  if (month === 12 && day >= 1 && day <= 26) {
    return 'christmas';
  }
  
  // New Year: Dec 27 - Jan 3
  if ((month === 12 && day >= 27) || (month === 1 && day <= 3)) {
    return 'newYear';
  }
  
  // Valentine's: Feb 10-15
  if (month === 2 && day >= 10 && day <= 15) {
    return 'valentines';
  }
  
  // Easter (approximate - late March/April) - check before spring
  const year = date.getFullYear();
  const easter = calculateEaster(year);
  const easterStart = new Date(easter);
  easterStart.setDate(easterStart.getDate() - 2);
  const easterEnd = new Date(easter);
  easterEnd.setDate(easterEnd.getDate() + 1);
  
  if (date >= easterStart && date <= easterEnd) {
    return 'easter';
  }
  
  // Halloween: Oct 25 - Nov 1
  if ((month === 10 && day >= 25) || (month === 11 && day === 1)) {
    return 'halloween';
  }
  
  // Thanksgiving: 4th Thursday of November (approximate Nov 22-28)
  if (month === 11) {
    const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4); // 4th Thursday
    const thanksgivingStart = new Date(thanksgiving);
    thanksgivingStart.setDate(thanksgivingStart.getDate() - 1);
    const thanksgivingEnd = new Date(thanksgiving);
    thanksgivingEnd.setDate(thanksgivingEnd.getDate() + 3);
    
    if (date >= thanksgivingStart && date <= thanksgivingEnd) {
      return 'thanksgiving';
    }
  }
  
  // Seasonal themes
  // Spring: Mar 20 - Jun 20
  if ((month === 3 && day >= 20) || (month > 3 && month < 6) || (month === 6 && day <= 20)) {
    return 'spring';
  }
  
  // Summer: Jun 21 - Sep 21
  if ((month === 6 && day >= 21) || (month > 6 && month < 9) || (month === 9 && day <= 21)) {
    return 'summer';
  }
  
  // Fall: Sep 22 - Dec 20
  if ((month === 9 && day >= 22) || (month > 9 && month < 12) || (month === 12 && day <= 20)) {
    return 'fall';
  }
  
  // Winter: Dec 21 - Mar 19
  if ((month === 12 && day >= 21) || month <= 2 || (month === 3 && day <= 19)) {
    return 'winter';
  }
  
  return 'default';
}

/**
 * Calculate Easter date (Anonymous Gregorian algorithm)
 */
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month, day);
}

/**
 * Get the nth weekday of a month
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7);
  day += (n - 1) * 7;
  return new Date(year, month, day);
}

export function getThemeConfig(theme: SeasonalTheme): SeasonalThemeConfig {
  return SEASONAL_THEMES[theme] || SEASONAL_THEMES.default;
}

// ============================================================================
// SEASONAL EFFECTS TIMING CONFIG (AI Brain editable)
// All timing values in milliseconds for easy adjustment
// ============================================================================

export interface SnowEffectConfig {
  // Snow pile accumulation cycle
  formDuration: number;      // How long snow piles take to form
  holdDuration: number;      // How long snow piles stay at max height
  dissolveDuration: number;  // How long snow piles take to melt
  
  // Snowfall density (0.1 = sparse, 1.0 = heavy)
  intensity: number;
  
  // Speed variation cycle (ms between speed changes)
  speedCycleDuration: { min: number; max: number };
  
  // Performance: max snowflakes on screen
  maxSnowflakes: { mobile: number; desktop: number };
  
  // Spawn rates per frame (lower = less snow)
  spawnRates: {
    fast: number;
    medium: number;
    slow: number;
  };
}

export interface SantaFlyoverConfig {
  // Time between Santa appearances (ms)
  intervalRange: { min: number; max: number };
  
  // Duration of each flyover (ms)
  flyoverDuration: number;
  
  // Size on different devices
  size: { mobile: number; desktop: number };
  
  // Enable/disable Santa
  enabled: boolean;
  
  // Show initial flyover on page load
  showInitialFlyover: boolean;
}

export interface SeasonalEffectsConfig {
  snow: SnowEffectConfig;
  santa: SantaFlyoverConfig;
}

/**
 * CENTRALIZED SEASONAL EFFECTS CONFIG
 * AI Brain and Trinity can modify these values for optimization
 * All timing values are in milliseconds
 */
export const SEASONAL_EFFECTS_CONFIG: SeasonalEffectsConfig = {
  snow: {
    // Snow pile cycle: 12 minutes total (form 5min + hold 3min + dissolve 4min)
    formDuration: 300000,     // 5 minutes
    holdDuration: 180000,     // 3 minutes  
    dissolveDuration: 240000, // 4 minutes
    
    // Lower intensity = less resource usage
    intensity: 0.5,
    
    // Speed variation every 8-20 seconds
    speedCycleDuration: { min: 8000, max: 20000 },
    
    // Reduced max snowflakes for performance
    maxSnowflakes: { mobile: 25, desktop: 50 },
    
    // Low spawn rates to reduce lag
    spawnRates: {
      fast: 0.15,
      medium: 0.08,
      slow: 0.04,
    },
  },
  
  santa: {
    // Santa appears every 1.5-2.5 hours
    intervalRange: { min: 5400000, max: 9000000 }, // 90-150 minutes
    
    // Each flyover lasts 12 seconds
    flyoverDuration: 12000,
    
    // Size in pixels
    size: { mobile: 90, desktop: 140 },
    
    // Can be disabled entirely
    enabled: true,
    
    // Show one flyover when page first loads
    showInitialFlyover: true,
  },
};

export function getSnowConfig(): SnowEffectConfig {
  return SEASONAL_EFFECTS_CONFIG.snow;
}

export function getSantaConfig(): SantaFlyoverConfig {
  return SEASONAL_EFFECTS_CONFIG.santa;
}
