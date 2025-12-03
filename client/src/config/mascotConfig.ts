/**
 * Universal Mascot Configuration
 * 
 * Central configuration for the CoAI Twin mascot system.
 * Edit this file to change mascot behavior platform-wide.
 * NO page-by-page changes required - all settings flow from here.
 * 
 * Features:
 * - AI-powered smart assistant connected to Gemini AI brain
 * - Live FAQ data pulling
 * - Self-resizing based on device/screen
 * - Holiday-aware thought monologues
 * - Contextual reactions (movement, taps, drag)
 * - Business growth advice and task creation
 * - Gamification guidance
 */

export type MascotMode = 
  | 'IDLE' 
  | 'SEARCHING' 
  | 'THINKING' 
  | 'ANALYZING' 
  | 'CODING' 
  | 'LISTENING' 
  | 'UPLOADING' 
  | 'SUCCESS' 
  | 'ERROR'
  | 'CELEBRATING'
  | 'ADVISING'
  | 'HOLIDAY'
  | 'GREETING';

export type InteractionType = 
  | 'drag_start' 
  | 'drag_move' 
  | 'drag_end' 
  | 'tap' 
  | 'double_tap' 
  | 'long_press'
  | 'idle_timeout'
  | 'page_change'
  | 'ai_update';

export type HolidayKey = 
  | 'new_year' 
  | 'valentines' 
  | 'spring' 
  | 'easter' 
  | 'summer' 
  | 'halloween' 
  | 'thanksgiving' 
  | 'christmas' 
  | 'default';

export interface MascotSizes {
  bubble: number;
  defaultSize: number;
  expandedSize: number;
  minSize: number;
  maxSize: number;
}

export interface FloatMotion {
  enabled: boolean;
  amplitude: { x: number; y: number };
  frequency: number;
  boundsPadding: number;
  dragZoomScale: number;
  dragZoomDuration: number;
}

export interface Reactions {
  movement: {
    slow: string[];
    fast: string[];
    veryFast: string[];
    stop: string[];
  };
  tap: {
    single: string[];
    double: string[];
    longPress: string[];
  };
  drag: {
    start: string[];
    moving: string[];
    end: string[];
  };
  idle: {
    short: string[];
    medium: string[];
    long: string[];
  };
}

export interface HolidayConfig {
  key: HolidayKey;
  name: string;
  dateRange: { startMonth: number; startDay: number; endMonth: number; endDay: number };
  thoughts: string[];
  greeting: string;
}

export interface AIConfig {
  enabled: boolean;
  updateCheckInterval: number;
  faqPollInterval: number;
  insightInterval: number;
  endpoints: {
    insights: string;
    faqs: string;
    tasks: string;
    advice: string;
  };
  updateAnnouncements: string[];
  businessAdviceCategories: string[];
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  points: number;
  priority: 'low' | 'medium' | 'high';
}

export type TransportEffect = 'glide' | 'zap' | 'float' | 'dash';

export interface TransportEffectConfig {
  type: TransportEffect;
  duration: number;
  trailEnabled: boolean;
  sparkleEnabled: boolean;
  glowColor: string;
}

// ============================================================================
// TRINITY STAR PHYSICS CONFIGURATION
// Dynamic settings for 3-star mascot - NO HARDCODED VALUES
// ============================================================================

export interface TrinityStarConfig {
  orbitRadiusMultiplier: number;     // Multiplier for orbit radius (0.4-0.7)
  minOrbitRadius: number;            // Minimum absolute orbit radius in px
  starSizeMultiplier: number;        // Star body size as % of mascot size
  glowRadiusMultiplier: number;      // Glow extends this far from star edge
  minDistance: number;               // Minimum distance between stars (physics)
  individualFloatAmplitude: number;  // How much each star floats independently
  repulsionStrength: number;         // How hard stars push apart
  springStrength: number;            // How strongly stars return to formation
}

export const TRINITY_STAR_CONFIG: TrinityStarConfig = {
  orbitRadiusMultiplier: 0.35,       // 35% of mascot size - fits ALL 3 stars within canvas bounds
  minOrbitRadius: 25,                // Minimum 25px orbit - compact but visible separation
  starSizeMultiplier: 0.12,          // 12% of mascot size - visible stars
  glowRadiusMultiplier: 0.15,        // Tight glow - 15% of star size
  minDistance: 35,                   // 35px gap between stars - clear separation
  individualFloatAmplitude: 3,       // Each star floats +/- 3px independently
  repulsionStrength: 15.0,           // MAXIMUM repulsion force - PREVENTS 3RD STAR HIDING
  springStrength: 0.015,             // Very weak pull-together for maximum independence
};

// ============================================================================
// EMOTE ANIMATION PHASE SYSTEM
// Animations loop through phases then return to IDLE
// ============================================================================

export type EmotePhase = 'IDLE' | 'ENTER' | 'ACTIVE' | 'PEAK' | 'EXIT' | 'RETURN_TO_IDLE';

export interface EmotePhaseConfig {
  phases: EmotePhase[];              // Sequence of phases
  phaseDurations: Record<EmotePhase, number>; // Duration of each phase in ms
  loopPhases?: EmotePhase[];         // Which phases loop (optional)
  loopCount?: number;                // How many times to loop (0 = until stopped)
  syncAllStars: boolean;             // All 3 stars animate in unison
  returnToIdleOnComplete: boolean;   // Auto-return to idle after animation
}

export const EMOTE_PHASE_CONFIGS: Record<string, EmotePhaseConfig> = {
  default: {
    phases: ['ENTER', 'ACTIVE', 'EXIT', 'RETURN_TO_IDLE'],
    phaseDurations: { IDLE: 0, ENTER: 300, ACTIVE: 2000, PEAK: 500, EXIT: 300, RETURN_TO_IDLE: 200 },
    syncAllStars: true,
    returnToIdleOnComplete: true,
  },
  celebrating: {
    phases: ['ENTER', 'ACTIVE', 'PEAK', 'ACTIVE', 'PEAK', 'EXIT', 'RETURN_TO_IDLE'],
    phaseDurations: { IDLE: 0, ENTER: 200, ACTIVE: 800, PEAK: 400, EXIT: 300, RETURN_TO_IDLE: 300 },
    loopPhases: ['ACTIVE', 'PEAK'],
    loopCount: 3,
    syncAllStars: true,
    returnToIdleOnComplete: true,
  },
  thinking: {
    phases: ['ENTER', 'ACTIVE', 'EXIT', 'RETURN_TO_IDLE'],
    phaseDurations: { IDLE: 0, ENTER: 400, ACTIVE: 0, PEAK: 0, EXIT: 400, RETURN_TO_IDLE: 200 },
    syncAllStars: true,
    returnToIdleOnComplete: false, // Stays in thinking until mode changes
  },
  alert: {
    phases: ['ENTER', 'PEAK', 'ACTIVE', 'EXIT', 'RETURN_TO_IDLE'],
    phaseDurations: { IDLE: 0, ENTER: 100, ACTIVE: 1500, PEAK: 300, EXIT: 200, RETURN_TO_IDLE: 200 },
    loopPhases: ['PEAK'],
    loopCount: 5,
    syncAllStars: true,
    returnToIdleOnComplete: true,
  },
  notification: {
    phases: ['ENTER', 'PEAK', 'ACTIVE', 'EXIT', 'RETURN_TO_IDLE'],
    phaseDurations: { IDLE: 0, ENTER: 150, ACTIVE: 2000, PEAK: 200, EXIT: 250, RETURN_TO_IDLE: 200 },
    syncAllStars: true,
    returnToIdleOnComplete: true,
  },
};

// Get phase config for an emote type
export function getEmotePhaseConfig(emoteType: string): EmotePhaseConfig {
  return EMOTE_PHASE_CONFIGS[emoteType] || EMOTE_PHASE_CONFIGS.default;
}

// Emote system for mascot expressions
export type EmoteType = 
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'thinking'
  | 'focused'
  | 'surprised'
  | 'sleepy'
  | 'celebrating'
  | 'helpful'
  | 'waving'
  | 'nodding'
  | 'concerned'
  | 'proud';

export interface EmoteConfig {
  type: EmoteType;
  duration: number;
  starBehavior: {
    purple: { scale: number; wobble: number; glow: number; speed: number };
    cyan: { scale: number; wobble: number; glow: number; speed: number };
  };
  particleEffect?: 'sparkle' | 'hearts' | 'stars' | 'confetti' | 'zzz' | 'question' | 'exclaim';
  soundCue?: string;
}

export interface EmoteContext {
  trigger: string;
  emote: EmoteType;
  priority: number;
  conditions?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    userAction?: string;
    pagePattern?: string;
  };
}

export const EMOTE_CONFIGS: Record<EmoteType, EmoteConfig> = {
  neutral: {
    type: 'neutral',
    duration: 0,
    starBehavior: {
      purple: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
      cyan: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
    },
  },
  happy: {
    type: 'happy',
    duration: 3000,
    starBehavior: {
      purple: { scale: 1.25, wobble: 1.2, glow: 0.85, speed: 1.6 },
      cyan: { scale: 1.25, wobble: 1.2, glow: 0.85, speed: 1.6 },
    },
    particleEffect: 'sparkle',
  },
  excited: {
    type: 'excited',
    duration: 4000,
    starBehavior: {
      purple: { scale: 1.4, wobble: 2.2, glow: 1.0, speed: 2.5 },
      cyan: { scale: 1.4, wobble: 2.2, glow: 1.0, speed: 2.5 },
    },
    particleEffect: 'stars',
  },
  curious: {
    type: 'curious',
    duration: 2500,
    starBehavior: {
      purple: { scale: 0.85, wobble: 0.5, glow: 0.65, speed: 0.8 },
      cyan: { scale: 1.3, wobble: 0.9, glow: 0.85, speed: 1.4 },
    },
    particleEffect: 'question',
  },
  thinking: {
    type: 'thinking',
    duration: 3000,
    starBehavior: {
      purple: { scale: 1, wobble: 0.2, glow: 0.5, speed: 0.5 },
      cyan: { scale: 1, wobble: 0.2, glow: 0.5, speed: 0.5 },
    },
  },
  focused: {
    type: 'focused',
    duration: 0,
    starBehavior: {
      purple: { scale: 1.05, wobble: 0.1, glow: 0.7, speed: 0.3 },
      cyan: { scale: 1.05, wobble: 0.1, glow: 0.7, speed: 0.3 },
    },
  },
  surprised: {
    type: 'surprised',
    duration: 1500,
    starBehavior: {
      purple: { scale: 1.5, wobble: 2.8, glow: 1.0, speed: 3.0 },
      cyan: { scale: 1.5, wobble: 2.8, glow: 1.0, speed: 3.0 },
    },
    particleEffect: 'exclaim',
  },
  sleepy: {
    type: 'sleepy',
    duration: 5000,
    starBehavior: {
      purple: { scale: 0.85, wobble: 0.2, glow: 0.2, speed: 0.3 },
      cyan: { scale: 0.85, wobble: 0.2, glow: 0.2, speed: 0.3 },
    },
    particleEffect: 'zzz',
  },
  celebrating: {
    type: 'celebrating',
    duration: 5000,
    starBehavior: {
      purple: { scale: 1.25, wobble: 2, glow: 1, speed: 2.5 },
      cyan: { scale: 1.25, wobble: 2, glow: 1, speed: 2.5 },
    },
    particleEffect: 'confetti',
  },
  helpful: {
    type: 'helpful',
    duration: 3000,
    starBehavior: {
      purple: { scale: 1.1, wobble: 0.6, glow: 0.6, speed: 1 },
      cyan: { scale: 1.15, wobble: 0.7, glow: 0.7, speed: 1.2 },
    },
    particleEffect: 'sparkle',
  },
  waving: {
    type: 'waving',
    duration: 2000,
    starBehavior: {
      purple: { scale: 1, wobble: 1.5, glow: 0.5, speed: 2 },
      cyan: { scale: 1.1, wobble: 0.8, glow: 0.6, speed: 1.5 },
    },
  },
  nodding: {
    type: 'nodding',
    duration: 1500,
    starBehavior: {
      purple: { scale: 1, wobble: 0.3, glow: 0.5, speed: 1.8 },
      cyan: { scale: 1, wobble: 0.3, glow: 0.5, speed: 1.8 },
    },
  },
  concerned: {
    type: 'concerned',
    duration: 3000,
    starBehavior: {
      purple: { scale: 0.95, wobble: 0.4, glow: 0.4, speed: 0.6 },
      cyan: { scale: 0.95, wobble: 0.4, glow: 0.4, speed: 0.6 },
    },
  },
  proud: {
    type: 'proud',
    duration: 4000,
    starBehavior: {
      purple: { scale: 1.15, wobble: 0.5, glow: 0.8, speed: 0.8 },
      cyan: { scale: 1.15, wobble: 0.5, glow: 0.8, speed: 0.8 },
    },
    particleEffect: 'stars',
  },
};

// Random variations for each emote type - gives personality through variety
export const EMOTE_VARIATIONS: Record<EmoteType, EmoteConfig[]> = {
  neutral: [
    EMOTE_CONFIGS.neutral, // Base neutral
    { type: 'neutral', duration: 0, starBehavior: { purple: { scale: 0.95, wobble: 0.3, glow: 0.35, speed: 0.8 }, cyan: { scale: 1.05, wobble: 0.4, glow: 0.45, speed: 0.9 } } },
    { type: 'neutral', duration: 0, starBehavior: { purple: { scale: 1.02, wobble: 0.6, glow: 0.38, speed: 1.1 }, cyan: { scale: 0.98, wobble: 0.55, glow: 0.42, speed: 1.05 } } },
  ],
  happy: [
    EMOTE_CONFIGS.happy, // Base happy with sparkle
    { type: 'happy', duration: 2500, starBehavior: { purple: { scale: 1.3, wobble: 1.4, glow: 0.9, speed: 1.8 }, cyan: { scale: 1.2, wobble: 1.0, glow: 0.8, speed: 1.5 } }, particleEffect: 'hearts' },
    { type: 'happy', duration: 3500, starBehavior: { purple: { scale: 1.15, wobble: 0.9, glow: 0.75, speed: 1.4 }, cyan: { scale: 1.35, wobble: 1.5, glow: 0.95, speed: 1.9 } }, particleEffect: 'sparkle' },
    { type: 'happy', duration: 2800, starBehavior: { purple: { scale: 1.28, wobble: 1.3, glow: 0.88, speed: 1.7 }, cyan: { scale: 1.22, wobble: 1.1, glow: 0.82, speed: 1.55 } }, particleEffect: 'stars' },
  ],
  excited: [
    EMOTE_CONFIGS.excited, // Base excited with stars
    { type: 'excited', duration: 3500, starBehavior: { purple: { scale: 1.5, wobble: 2.5, glow: 1.1, speed: 2.8 }, cyan: { scale: 1.3, wobble: 2.0, glow: 0.95, speed: 2.3 } }, particleEffect: 'confetti' },
    { type: 'excited', duration: 4500, starBehavior: { purple: { scale: 1.35, wobble: 2.0, glow: 0.9, speed: 2.2 }, cyan: { scale: 1.45, wobble: 2.4, glow: 1.05, speed: 2.7 } }, particleEffect: 'sparkle' },
    { type: 'excited', duration: 3800, starBehavior: { purple: { scale: 1.42, wobble: 2.3, glow: 1.0, speed: 2.6 }, cyan: { scale: 1.38, wobble: 2.1, glow: 0.98, speed: 2.45 } }, particleEffect: 'stars' },
  ],
  curious: [
    EMOTE_CONFIGS.curious, // Base curious with question
    { type: 'curious', duration: 2800, starBehavior: { purple: { scale: 0.9, wobble: 0.6, glow: 0.7, speed: 0.9 }, cyan: { scale: 1.25, wobble: 0.8, glow: 0.8, speed: 1.3 } } },
    { type: 'curious', duration: 2200, starBehavior: { purple: { scale: 0.8, wobble: 0.4, glow: 0.6, speed: 0.7 }, cyan: { scale: 1.35, wobble: 1.0, glow: 0.9, speed: 1.5 } }, particleEffect: 'question' },
  ],
  thinking: [
    EMOTE_CONFIGS.thinking, // Base thinking
    { type: 'thinking', duration: 3500, starBehavior: { purple: { scale: 1.05, wobble: 0.25, glow: 0.55, speed: 0.6 }, cyan: { scale: 0.95, wobble: 0.18, glow: 0.48, speed: 0.45 } } },
    { type: 'thinking', duration: 2800, starBehavior: { purple: { scale: 0.98, wobble: 0.15, glow: 0.52, speed: 0.4 }, cyan: { scale: 1.02, wobble: 0.22, glow: 0.5, speed: 0.55 } }, particleEffect: 'question' },
  ],
  focused: [
    EMOTE_CONFIGS.focused, // Base focused
    { type: 'focused', duration: 0, starBehavior: { purple: { scale: 1.08, wobble: 0.08, glow: 0.75, speed: 0.25 }, cyan: { scale: 1.02, wobble: 0.12, glow: 0.68, speed: 0.35 } } },
    { type: 'focused', duration: 0, starBehavior: { purple: { scale: 1.03, wobble: 0.15, glow: 0.72, speed: 0.28 }, cyan: { scale: 1.07, wobble: 0.08, glow: 0.74, speed: 0.32 } } },
  ],
  surprised: [
    EMOTE_CONFIGS.surprised, // Base surprised with exclaim
    { type: 'surprised', duration: 1200, starBehavior: { purple: { scale: 1.6, wobble: 3.0, glow: 1.1, speed: 3.2 }, cyan: { scale: 1.4, wobble: 2.6, glow: 0.95, speed: 2.8 } }, particleEffect: 'exclaim' },
    { type: 'surprised', duration: 1800, starBehavior: { purple: { scale: 1.45, wobble: 2.5, glow: 0.95, speed: 2.8 }, cyan: { scale: 1.55, wobble: 3.0, glow: 1.05, speed: 3.1 } }, particleEffect: 'stars' },
  ],
  sleepy: [
    EMOTE_CONFIGS.sleepy, // Base sleepy with zzz
    { type: 'sleepy', duration: 6000, starBehavior: { purple: { scale: 0.8, wobble: 0.15, glow: 0.18, speed: 0.25 }, cyan: { scale: 0.9, wobble: 0.22, glow: 0.22, speed: 0.35 } }, particleEffect: 'zzz' },
    { type: 'sleepy', duration: 4500, starBehavior: { purple: { scale: 0.88, wobble: 0.18, glow: 0.2, speed: 0.28 }, cyan: { scale: 0.82, wobble: 0.2, glow: 0.18, speed: 0.3 } }, particleEffect: 'zzz' },
  ],
  celebrating: [
    EMOTE_CONFIGS.celebrating, // Base celebrating with confetti
    { type: 'celebrating', duration: 4500, starBehavior: { purple: { scale: 1.3, wobble: 2.2, glow: 1.1, speed: 2.7 }, cyan: { scale: 1.2, wobble: 1.8, glow: 0.95, speed: 2.3 } }, particleEffect: 'stars' },
    { type: 'celebrating', duration: 5500, starBehavior: { purple: { scale: 1.35, wobble: 2.3, glow: 1.05, speed: 2.6 }, cyan: { scale: 1.15, wobble: 1.7, glow: 0.9, speed: 2.4 } }, particleEffect: 'confetti' },
    { type: 'celebrating', duration: 4800, starBehavior: { purple: { scale: 1.28, wobble: 2.1, glow: 1.02, speed: 2.55 }, cyan: { scale: 1.22, wobble: 1.9, glow: 0.98, speed: 2.45 } }, particleEffect: 'sparkle' },
  ],
  helpful: [
    EMOTE_CONFIGS.helpful, // Base helpful with sparkle
    { type: 'helpful', duration: 3500, starBehavior: { purple: { scale: 1.15, wobble: 0.7, glow: 0.65, speed: 1.1 }, cyan: { scale: 1.1, wobble: 0.6, glow: 0.65, speed: 1.0 } }, particleEffect: 'hearts' },
    { type: 'helpful', duration: 2800, starBehavior: { purple: { scale: 1.08, wobble: 0.55, glow: 0.58, speed: 0.95 }, cyan: { scale: 1.18, wobble: 0.75, glow: 0.72, speed: 1.25 } }, particleEffect: 'sparkle' },
  ],
  waving: [
    EMOTE_CONFIGS.waving, // Base waving
    { type: 'waving', duration: 2500, starBehavior: { purple: { scale: 1.05, wobble: 1.7, glow: 0.55, speed: 2.2 }, cyan: { scale: 1.15, wobble: 0.9, glow: 0.65, speed: 1.7 } } },
    { type: 'waving', duration: 1800, starBehavior: { purple: { scale: 0.95, wobble: 1.3, glow: 0.48, speed: 1.8 }, cyan: { scale: 1.2, wobble: 1.0, glow: 0.7, speed: 1.9 } }, particleEffect: 'sparkle' },
  ],
  nodding: [
    EMOTE_CONFIGS.nodding, // Base nodding
    { type: 'nodding', duration: 1800, starBehavior: { purple: { scale: 1.05, wobble: 0.35, glow: 0.52, speed: 1.9 }, cyan: { scale: 0.95, wobble: 0.28, glow: 0.48, speed: 1.7 } } },
    { type: 'nodding', duration: 1200, starBehavior: { purple: { scale: 0.98, wobble: 0.25, glow: 0.48, speed: 2.0 }, cyan: { scale: 1.02, wobble: 0.35, glow: 0.52, speed: 1.85 } } },
  ],
  concerned: [
    EMOTE_CONFIGS.concerned, // Base concerned
    { type: 'concerned', duration: 3500, starBehavior: { purple: { scale: 0.9, wobble: 0.35, glow: 0.38, speed: 0.55 }, cyan: { scale: 1.0, wobble: 0.45, glow: 0.42, speed: 0.65 } } },
    { type: 'concerned', duration: 2800, starBehavior: { purple: { scale: 0.92, wobble: 0.38, glow: 0.35, speed: 0.5 }, cyan: { scale: 0.98, wobble: 0.42, glow: 0.45, speed: 0.7 } }, particleEffect: 'question' },
  ],
  proud: [
    EMOTE_CONFIGS.proud, // Base proud with stars
    { type: 'proud', duration: 4500, starBehavior: { purple: { scale: 1.2, wobble: 0.55, glow: 0.85, speed: 0.85 }, cyan: { scale: 1.1, wobble: 0.45, glow: 0.75, speed: 0.75 } }, particleEffect: 'sparkle' },
    { type: 'proud', duration: 3500, starBehavior: { purple: { scale: 1.12, wobble: 0.48, glow: 0.78, speed: 0.78 }, cyan: { scale: 1.18, wobble: 0.52, glow: 0.82, speed: 0.82 } }, particleEffect: 'stars' },
  ],
};

// Get a random variation for an emote type
export function getRandomEmoteVariation(emoteType: EmoteType): EmoteConfig {
  const variations = EMOTE_VARIATIONS[emoteType];
  if (!variations || variations.length === 0) {
    return EMOTE_CONFIGS[emoteType];
  }
  return variations[Math.floor(Math.random() * variations.length)];
}

// Context-based emote triggers
export const EMOTE_CONTEXTS: EmoteContext[] = [
  // Page navigation triggers
  { trigger: 'page_change', emote: 'curious', priority: 1 },
  { trigger: 'page_dashboard', emote: 'helpful', priority: 2, conditions: { pagePattern: '/dashboard' } },
  { trigger: 'page_analytics', emote: 'focused', priority: 2, conditions: { pagePattern: '/analytics' } },
  { trigger: 'page_schedule', emote: 'thinking', priority: 2, conditions: { pagePattern: '/schedule' } },
  { trigger: 'page_payroll', emote: 'focused', priority: 2, conditions: { pagePattern: '/payroll' } },
  { trigger: 'page_settings', emote: 'helpful', priority: 2, conditions: { pagePattern: '/settings' } },
  
  // User action triggers
  { trigger: 'task_complete', emote: 'celebrating', priority: 5 },
  { trigger: 'form_submit', emote: 'happy', priority: 3 },
  { trigger: 'error_occurred', emote: 'concerned', priority: 4 },
  { trigger: 'login_success', emote: 'waving', priority: 5 },
  { trigger: 'first_visit', emote: 'excited', priority: 5 },
  
  // Time-based triggers
  { trigger: 'time_morning', emote: 'waving', priority: 1, conditions: { timeOfDay: 'morning' } },
  { trigger: 'time_night', emote: 'sleepy', priority: 1, conditions: { timeOfDay: 'night' } },
  
  // Interaction triggers
  { trigger: 'mascot_tap', emote: 'surprised', priority: 3 },
  { trigger: 'mascot_drag', emote: 'excited', priority: 2 },
  { trigger: 'mascot_idle', emote: 'neutral', priority: 0 },
  { trigger: 'roaming_start', emote: 'curious', priority: 2 },
  { trigger: 'roaming_end', emote: 'happy', priority: 2 },
  
  // AI/Help triggers
  { trigger: 'ai_response', emote: 'helpful', priority: 3 },
  { trigger: 'faq_found', emote: 'proud', priority: 3 },
  { trigger: 'advice_given', emote: 'nodding', priority: 2 },
];

export interface RoamingConfig {
  enabled: boolean;
  interval: { min: number; max: number };
  moveDuration: number;
  pauseDuration: { min: number; max: number };
  boundsPadding: number;
  avoidEdges: boolean;
  preferCorners: boolean;
  transportEffects: {
    enabled: boolean;
    effects: TransportEffectConfig[];
    randomizeEffect: boolean;
  };
  reactions: {
    startMoving: string[];
    reachedDestination: string[];
    exploring: string[];
  };
}

// ============================================================================
// MOBILE GRAPHICS QUALITY SYSTEM
// Adaptive rendering tiers for optimal performance across devices
// ============================================================================

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  maxDPR: number;
  targetFPS: number;
  glowIntensity: number;
  glowBlurRadius: number;
  particleCount: number;
  ledCount: number;
  shadowQuality: 'full' | 'simple' | 'none';
  enableRimLight: boolean;
  enableInnerGlow: boolean;
  haloAlpha: number;
  animationSmoothing: number;
}

export interface PerformanceConfig {
  enableAdaptiveQuality: boolean;
  frameBudgetMs: number;
  idleThrottleDelay: number;
  idleTargetFPS: number;
  qualityUpgradeThreshold: number;
  qualityDowngradeThreshold: number;
  measurementWindow: number;
}

// Quality tier presets - mobile gets crisp, performant rendering
export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: 'high',
    maxDPR: 2.5,
    targetFPS: 60,
    glowIntensity: 0.35,
    glowBlurRadius: 1.2,
    particleCount: 10,
    ledCount: 8,
    shadowQuality: 'full',
    enableRimLight: true,
    enableInnerGlow: true,
    haloAlpha: 0.25,
    animationSmoothing: 1.0,
  },
  medium: {
    tier: 'medium',
    maxDPR: 2.0,
    targetFPS: 45,
    glowIntensity: 0.25,
    glowBlurRadius: 0.8,
    particleCount: 6,
    ledCount: 5,
    shadowQuality: 'simple',
    enableRimLight: true,
    enableInnerGlow: false,
    haloAlpha: 0.18,
    animationSmoothing: 0.8,
  },
  low: {
    tier: 'low',
    maxDPR: 1.5,
    targetFPS: 30,
    glowIntensity: 0.15,
    glowBlurRadius: 0.5,
    particleCount: 3,
    ledCount: 3,
    shadowQuality: 'none',
    enableRimLight: false,
    enableInnerGlow: false,
    haloAlpha: 0.12,
    animationSmoothing: 0.6,
  },
};

export const PERFORMANCE_CONFIG: PerformanceConfig = {
  enableAdaptiveQuality: true,
  frameBudgetMs: 16.67, // 60 FPS target
  idleThrottleDelay: 5000, // 5 seconds of idle before throttling
  idleTargetFPS: 15,
  qualityUpgradeThreshold: 55, // FPS threshold to upgrade quality
  qualityDowngradeThreshold: 35, // FPS threshold to downgrade quality
  measurementWindow: 3000, // 3 seconds of measurement before tier change
};

// Device detection helper for initial quality tier
export function detectInitialQualityTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  
  const isMobile = window.matchMedia?.('(max-width: 768px)').matches || 
                   'ontouchstart' in window ||
                   navigator.maxTouchPoints > 0;
  
  const memoryGB = (navigator as any).deviceMemory || 4;
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  
  // High-end device detection
  if (!isMobile && memoryGB >= 8 && hardwareConcurrency >= 8) {
    return 'high';
  }
  
  // Mid-range or newer mobile devices
  if (memoryGB >= 4 && hardwareConcurrency >= 4 && dpr <= 3) {
    return isMobile ? 'medium' : 'high';
  }
  
  // Lower-end devices or high DPR screens (battery concern)
  if (isMobile && dpr >= 3) {
    return 'medium';
  }
  
  // Budget devices
  if (memoryGB < 3 || hardwareConcurrency < 4) {
    return 'low';
  }
  
  return isMobile ? 'medium' : 'high';
}

// Touch feedback configuration
export interface TouchFeedbackConfig {
  enableHaptic: boolean;
  enableRipple: boolean;
  hapticDuration: number;
  rippleDuration: number;
  rippleColor: string;
  rippleOpacity: number;
}

export const TOUCH_FEEDBACK_CONFIG: TouchFeedbackConfig = {
  enableHaptic: true,
  enableRipple: true,
  hapticDuration: 10,
  rippleDuration: 300,
  rippleColor: 'rgba(168, 85, 247, 0.4)',
  rippleOpacity: 0.6,
};

// Thought Bubble Styling System
export type ThoughtBubbleMode = 'normal' | 'seasonal' | 'holiday';
export type ThoughtBubbleAnimation = 
  | 'fade' 
  | 'slide-up' 
  | 'slide-down' 
  | 'pop' 
  | 'float-in' 
  | 'sparkle-in'
  | 'snowfall'
  | 'hearts-float'
  | 'leaves-drift'
  | 'confetti-burst';

// Thought bubble boundary - keeps bubble anchored and unified with mascot
// DESIGN NOTES for future handlers:
// - Background is nearly transparent (0.14 to 0.04 radial gradient) so mascot is always visible
// - Clearance gap is tight (32px desktop, 26px mobile) to position text close to mascot
// - Collision avoidance shifts bubble up/left/right when mascot moves suddenly
// - Text uses subtle shadow (0.35 opacity) for readability without blocking mascot
// - No borders, no box shadows - pure glassmorphism with 2px blur
export const THOUGHT_BUBBLE_BOUNDARY_CONFIG = {
  offsetAbove: 6, // pixels above mascot
  maxWidth: 280,   // max bubble width on desktop - larger for BOLD ALL CAPS
  mobileMaxWidth: 200, // max bubble width on mobile - larger for visibility
  padding: 6,
  anchorToMascot: true, // always stay attached to mascot position
  followMascotDrag: true, // move with mascot when dragged
  clearanceGap: { desktop: 32, mobile: 26 }, // pixels between bubble and mascot top
  collisionAvoidance: true, // shift bubble to avoid covering mascot on sudden moves
  backgroundOpacity: { center: 0.14, edge: 0.04 }, // nearly transparent radial gradient
  backdropBlur: 2, // minimal blur in pixels
};

export interface ThoughtBubbleStyle {
  background: string;
  backdropBlur: string;
  border: string;
  borderRadius: string;
  textColor: string;
  glowColor: string;
  glowIntensity: number;
  opacity: number;
  shadow: string;
}

export interface ThoughtBubbleAnimationConfig {
  enter: ThoughtBubbleAnimation;
  exit: ThoughtBubbleAnimation;
  duration: number;
  easing: string;
  particleEffect?: 'snowflakes' | 'hearts' | 'leaves' | 'sparkles' | 'confetti';
}

export interface ThoughtBubbleTheme {
  mode: ThoughtBubbleMode;
  style: ThoughtBubbleStyle;
  animation: ThoughtBubbleAnimationConfig;
  emoticonStyle?: 'default' | 'seasonal' | 'animated';
}

// Seasonal thought bubble configurations
// Updated for visibility on both light and dark backgrounds
export const THOUGHT_BUBBLE_THEMES: Record<HolidayKey, ThoughtBubbleTheme> = {
  default: {
    mode: 'normal',
    style: {
      background: 'rgba(15, 23, 42, 0.85)',
      backdropBlur: 'blur(12px)',
      border: '2px solid rgba(168, 85, 247, 0.5)',
      borderRadius: '12px',
      textColor: 'rgba(255, 255, 255, 0.95)',
      glowColor: 'rgba(168, 85, 247, 0.5)',
      glowIntensity: 0.5,
      opacity: 0.95,
      shadow: '0 4px 20px rgba(0, 0, 0, 0.3), 0 0 8px rgba(168, 85, 247, 0.3)',
    },
    animation: {
      enter: 'fade',
      exit: 'fade',
      duration: 300,
      easing: 'ease-out',
    },
    emoticonStyle: 'default',
  },
  new_year: {
    mode: 'holiday',
    style: {
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9))',
      backdropBlur: 'blur(12px)',
      border: '2px solid rgba(255, 215, 0, 0.6)',
      borderRadius: '16px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(255, 215, 0, 0.5)',
      glowIntensity: 0.6,
      opacity: 0.95,
      shadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 12px rgba(255, 215, 0, 0.3)',
    },
    animation: {
      enter: 'confetti-burst',
      exit: 'sparkle-in',
      duration: 500,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      particleEffect: 'confetti',
    },
    emoticonStyle: 'animated',
  },
  valentines: {
    mode: 'holiday',
    style: {
      background: 'rgba(15, 23, 42, 0.88)',
      backdropBlur: 'blur(10px)',
      border: '2px solid rgba(236, 72, 153, 0.6)',
      borderRadius: '20px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(236, 72, 153, 0.5)',
      glowIntensity: 0.5,
      opacity: 0.95,
      shadow: '0 4px 18px rgba(0, 0, 0, 0.4), 0 0 10px rgba(236, 72, 153, 0.3)',
    },
    animation: {
      enter: 'hearts-float',
      exit: 'fade',
      duration: 450,
      easing: 'ease-out',
      particleEffect: 'hearts',
    },
    emoticonStyle: 'seasonal',
  },
  spring: {
    mode: 'seasonal',
    style: {
      background: 'rgba(15, 23, 42, 0.85)',
      backdropBlur: 'blur(10px)',
      border: '2px solid rgba(74, 222, 128, 0.5)',
      borderRadius: '14px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(74, 222, 128, 0.4)',
      glowIntensity: 0.4,
      opacity: 0.95,
      shadow: '0 4px 16px rgba(0, 0, 0, 0.35), 0 0 8px rgba(74, 222, 128, 0.25)',
    },
    animation: {
      enter: 'float-in',
      exit: 'fade',
      duration: 400,
      easing: 'ease-out',
      particleEffect: 'sparkles',
    },
    emoticonStyle: 'seasonal',
  },
  easter: {
    mode: 'holiday',
    style: {
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(30, 41, 59, 0.88))',
      backdropBlur: 'blur(10px)',
      border: '2px solid rgba(196, 181, 253, 0.5)',
      borderRadius: '18px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(196, 181, 253, 0.4)',
      glowIntensity: 0.45,
      opacity: 0.95,
      shadow: '0 4px 16px rgba(0, 0, 0, 0.35), 0 0 8px rgba(196, 181, 253, 0.25)',
    },
    animation: {
      enter: 'pop',
      exit: 'fade',
      duration: 350,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    emoticonStyle: 'seasonal',
  },
  summer: {
    mode: 'seasonal',
    style: {
      background: 'rgba(15, 23, 42, 0.85)',
      backdropBlur: 'blur(10px)',
      border: '2px solid rgba(251, 191, 36, 0.5)',
      borderRadius: '12px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(251, 191, 36, 0.45)',
      glowIntensity: 0.5,
      opacity: 0.95,
      shadow: '0 4px 20px rgba(0, 0, 0, 0.35), 0 0 10px rgba(251, 191, 36, 0.25)',
    },
    animation: {
      enter: 'slide-up',
      exit: 'slide-down',
      duration: 300,
      easing: 'ease-out',
    },
    emoticonStyle: 'default',
  },
  halloween: {
    mode: 'holiday',
    style: {
      background: 'rgba(15, 23, 42, 0.9)',
      backdropBlur: 'blur(10px)',
      border: '2px solid rgba(249, 115, 22, 0.6)',
      borderRadius: '10px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(249, 115, 22, 0.5)',
      glowIntensity: 0.6,
      opacity: 0.95,
      shadow: '0 4px 18px rgba(0, 0, 0, 0.4), 0 0 12px rgba(249, 115, 22, 0.35)',
    },
    animation: {
      enter: 'pop',
      exit: 'fade',
      duration: 400,
      easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
    emoticonStyle: 'animated',
  },
  thanksgiving: {
    mode: 'holiday',
    style: {
      background: 'rgba(15, 23, 42, 0.88)',
      backdropBlur: 'blur(10px)',
      border: '2px solid rgba(217, 119, 6, 0.5)',
      borderRadius: '14px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(217, 119, 6, 0.45)',
      glowIntensity: 0.45,
      opacity: 0.95,
      shadow: '0 4px 16px rgba(0, 0, 0, 0.35), 0 0 10px rgba(217, 119, 6, 0.25)',
    },
    animation: {
      enter: 'leaves-drift',
      exit: 'fade',
      duration: 500,
      easing: 'ease-out',
      particleEffect: 'leaves',
    },
    emoticonStyle: 'seasonal',
  },
  christmas: {
    mode: 'holiday',
    style: {
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9))',
      backdropBlur: 'blur(12px)',
      border: '2px solid rgba(220, 38, 38, 0.4)',
      borderRadius: '16px',
      textColor: 'rgba(255, 255, 255, 0.98)',
      glowColor: 'rgba(22, 163, 74, 0.45)',
      glowIntensity: 0.5,
      opacity: 0.95,
      shadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 12px rgba(220, 38, 38, 0.2), 0 0 12px rgba(22, 163, 74, 0.2)',
    },
    animation: {
      enter: 'snowfall',
      exit: 'sparkle-in',
      duration: 600,
      easing: 'ease-out',
      particleEffect: 'snowflakes',
    },
    emoticonStyle: 'animated',
  },
};

// Get current thought bubble theme based on date
export function getCurrentThoughtBubbleTheme(): ThoughtBubbleTheme {
  const holiday = getCurrentHoliday();
  if (holiday) {
    return THOUGHT_BUBBLE_THEMES[holiday.key] || THOUGHT_BUBBLE_THEMES.default;
  }
  return THOUGHT_BUBBLE_THEMES.default;
}

// Thought content handler - decides what content to show
export interface ThoughtContentHandler {
  shouldShowThought: (context: ThoughtContext) => boolean;
  getThoughtContent: (context: ThoughtContext) => ThoughtContent | null;
  getTheme: () => ThoughtBubbleTheme;
}

export interface ThoughtContext {
  currentPage: string;
  userRole?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isHoliday: boolean;
  holidayKey?: HolidayKey;
  mascotMode: MascotMode;
  lastInteraction?: InteractionType;
  isRoaming: boolean;
  emote?: EmoteType;
}

export interface ThoughtContent {
  text: string;
  emoticon: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: 'default' | 'reaction' | 'holiday' | 'ai' | 'task' | 'contextual';
  displayDuration?: number;
}

// Create thought content handler
export function createThoughtContentHandler(): ThoughtContentHandler {
  return {
    shouldShowThought: (context: ThoughtContext): boolean => {
      // Always allow holiday thoughts
      if (context.isHoliday) return true;
      // Allow based on mode
      if (context.mascotMode !== 'IDLE' && context.mascotMode !== 'ERROR') return true;
      // Allow roaming thoughts
      if (context.isRoaming) return true;
      // Random chance for idle thoughts
      return Math.random() > 0.7;
    },
    
    getThoughtContent: (context: ThoughtContext): ThoughtContent | null => {
      // Holiday-specific content
      if (context.isHoliday && context.holidayKey) {
        const holiday = MASCOT_CONFIG.holidays.find(h => h.key === context.holidayKey);
        if (holiday) {
          const text = holiday.thoughts[Math.floor(Math.random() * holiday.thoughts.length)];
          return {
            text,
            emoticon: getEmoticon('HOLIDAY'),
            priority: 'high',
            source: 'holiday',
          };
        }
      }
      
      // Get contextual thought based on current state
      const thought = getRandomThought(context.mascotMode);
      if (thought) {
        return {
          text: thought,
          emoticon: getEmoticon(context.mascotMode),
          priority: 'normal',
          source: 'contextual',
        };
      }
      
      return null;
    },
    
    getTheme: (): ThoughtBubbleTheme => {
      return getCurrentThoughtBubbleTheme();
    },
  };
}

// ============================================================================
// PUBLIC PAGE PROMOTIONAL CONFIGURATION (Sales/Onboarding System)
// Mascot acts as a friendly sales guide on public pages
// ============================================================================

export interface PromoThought {
  text: string;
  ctaText?: string;          // Call-to-action button text
  ctaLink?: string;          // Navigation link for CTA
  priority: 'low' | 'normal' | 'high';
  emote?: EmoteType;
  showDiscount?: boolean;    // Show 10% first-time discount badge
}

export interface PublicPagePromoConfig {
  enabled: boolean;
  discountPercentage: number;
  discountLabel: string;
  rotateInterval: number;    // ms between promo rotations
  pageSpecificThoughts: Record<string, PromoThought[]>;
  generalPromos: PromoThought[];
  greetingThoughts: PromoThought[];  // First-visit welcome
}

export const PUBLIC_PAGE_PROMO_CONFIG: PublicPagePromoConfig = {
  enabled: true,
  discountPercentage: 10,
  discountLabel: '10% OFF First Month',
  rotateInterval: 25000, // 25 seconds between promo thoughts
  
  // Page-specific promotional thoughts
  pageSpecificThoughts: {
    '/': [
      { text: "Welcome! Ready to transform your workforce management?", ctaText: "See Plans", ctaLink: "/pricing", priority: 'high', emote: 'waving', showDiscount: true },
      { text: "I'm Trinity, your AI business buddy! Tap me anytime for help.", priority: 'normal', emote: 'helpful' },
      { text: "Did you know? CoAIleague automates scheduling, payroll, and more!", ctaText: "Learn More", ctaLink: "/pricing", priority: 'normal', emote: 'curious' },
      { text: "Join hundreds of businesses already saving time with AI!", ctaText: "Start Free", ctaLink: "/register", priority: 'high', emote: 'excited', showDiscount: true },
    ],
    '/pricing': [
      { text: "Great choice looking at our plans! Questions? Just ask me.", priority: 'normal', emote: 'helpful' },
      { text: "Pro tip: The Professional plan includes unlimited AI scheduling!", priority: 'normal', emote: 'nodding' },
      { text: "First-time signup? You'll get 10% off your first month!", priority: 'high', emote: 'excited', showDiscount: true },
      { text: "Need help choosing? I can compare plans for your business size.", priority: 'normal', emote: 'helpful' },
      { text: "Enterprise needs? We offer custom pricing and dedicated support!", ctaText: "Contact Sales", ctaLink: "/contact", priority: 'normal', emote: 'proud' },
    ],
    '/contact': [
      { text: "Looking to chat with our team? Great idea!", priority: 'normal', emote: 'happy' },
      { text: "Fun fact: Our support team responds in under 2 hours on average!", priority: 'normal', emote: 'proud' },
      { text: "Have questions about enterprise features? Our team loves helping!", priority: 'normal', emote: 'helpful' },
    ],
    '/support': [
      { text: "Need help? I'm here! Or fill out the form for our support team.", priority: 'normal', emote: 'helpful' },
      { text: "Quick questions? Ask me anything about CoAIleague!", priority: 'normal', emote: 'waving' },
    ],
    '/features': [
      { text: "Exploring features? Smart! Let me highlight the best ones.", priority: 'normal', emote: 'excited' },
      { text: "AI-powered scheduling saves businesses 8+ hours per week!", priority: 'high', emote: 'proud' },
      { text: "Love what you see? Start your free trial today!", ctaText: "Try Free", ctaLink: "/register", priority: 'high', emote: 'excited', showDiscount: true },
    ],
    '/homepage': [
      { text: "Hi there! I'm your AI workforce assistant. Need anything?", priority: 'normal', emote: 'waving' },
      { text: "Ready to streamline your business operations?", ctaText: "Get Started", ctaLink: "/register", priority: 'high', emote: 'excited', showDiscount: true },
    ],
  },
  
  // General promo thoughts (used on any public page)
  generalPromos: [
    { text: "Automate scheduling, payroll, invoicing, and more with AI!", priority: 'normal', emote: 'helpful' },
    { text: "Join the workforce revolution - hundreds of businesses trust us!", priority: 'normal', emote: 'proud' },
    { text: "First-timers get 10% off! Start your journey today.", ctaText: "Claim Discount", ctaLink: "/register", priority: 'high', emote: 'excited', showDiscount: true },
    { text: "Have questions? Tap me anytime - I love helping!", priority: 'normal', emote: 'happy' },
    { text: "Curious about AI workforce management? I can explain!", priority: 'normal', emote: 'curious' },
  ],
  
  // First-time visitor greeting
  greetingThoughts: [
    { text: "Hey there! Welcome to CoAIleague! I'm Trinity, your AI guide.", priority: 'high', emote: 'waving' },
    { text: "First time here? Awesome! Let me show you around.", ctaText: "Take Tour", ctaLink: "/pricing", priority: 'high', emote: 'excited' },
  ],
};

// Helper to check if a path is a public page
export function isPublicPage(pathname: string): boolean {
  const publicPaths = ['/', '/homepage', '/pricing', '/contact', '/support', '/features', '/terms-of-service', '/privacy-policy', '/about'];
  return publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'));
}

// Get promotional thoughts for current page
export function getPromoThoughts(pathname: string): PromoThought[] {
  if (!PUBLIC_PAGE_PROMO_CONFIG.enabled) return [];
  
  const pageSpecific = PUBLIC_PAGE_PROMO_CONFIG.pageSpecificThoughts[pathname] || [];
  return [...pageSpecific, ...PUBLIC_PAGE_PROMO_CONFIG.generalPromos];
}

// Get a random promo thought
export function getRandomPromoThought(pathname: string): PromoThought | null {
  const thoughts = getPromoThoughts(pathname);
  if (thoughts.length === 0) return null;
  
  // Prefer high-priority thoughts more often (60% chance)
  const highPriority = thoughts.filter(t => t.priority === 'high');
  if (highPriority.length > 0 && Math.random() < 0.6) {
    return highPriority[Math.floor(Math.random() * highPriority.length)];
  }
  
  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

export interface MascotConfig {
  enabled: boolean;
  desktop: MascotSizes;
  mobile: MascotSizes;
  defaultPosition: { x: number; y: number };
  mobileDefaultPosition: { x: number; y: number };
  zIndex: number;
  storageKeys: {
    position: string;
    expanded: string;
    tasks: string;
  };
  hiddenRoutes: string[];
  idleModeRoutes: string[];
  publicPageRoutes: string[];  // Public pages for promo mode
  defaultMode: MascotMode;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bubble: string;
    bubbleGlow: string;
  };
  animation: {
    transitionDuration: number;
    dragSmoothness: number;
    thoughtFadeDuration: number;
    floatEasing: string;
  };
  floatMotion: FloatMotion;
  roaming: RoamingConfig;
  reactions: Reactions;
  holidays: HolidayConfig[];
  ai: AIConfig;
  taskTemplates: TaskTemplate[];
  thoughts: {
    enabled: boolean;
    displayDuration: number;
    rotateInterval: number;
    emoticons: Record<MascotMode, string>;
    defaultThoughts: Record<MascotMode, string[]>;
  };
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
}

export const MASCOT_CONFIG: MascotConfig = {
  enabled: true,
  
  desktop: {
    bubble: 120,
    defaultSize: 120,
    expandedSize: 180,
    minSize: 100,
    maxSize: 220,
  },
  
  mobile: {
    bubble: 90,
    defaultSize: 90,
    expandedSize: 140,
    minSize: 75,
    maxSize: 170,
  },
  
  defaultPosition: {
    x: 16,
    y: 16,
  },
  
  mobileDefaultPosition: {
    x: 12,
    y: 12,
  },
  
  zIndex: 9999,
  
  storageKeys: {
    position: 'coaileague-mascot-position',
    expanded: 'coaileague-mascot-expanded',
    tasks: 'coaileague-mascot-tasks',
  },
  
  hiddenRoutes: [
    '/mascot-demo',
    '/login',
    '/register',
  ],
  
  idleModeRoutes: [
    '/',
    '/pricing',
    '/features',
    '/about',
  ],
  
  publicPageRoutes: [
    '/',
    '/homepage',
    '/pricing',
    '/contact',
    '/support',
    '/features',
    '/terms-of-service',
    '/privacy-policy',
    '/about',
  ],
  
  defaultMode: 'IDLE',
  
  colors: {
    primary: '#a855f7',      // Purple star
    secondary: '#38bdf8',    // Cyan star
    accent: '#a855f7',       // Purple accent
    bubble: 'rgba(15, 23, 42, 0.95)',
    bubbleGlow: 'rgba(168, 85, 247, 0.4)',
  },
  
  animation: {
    transitionDuration: 200,
    dragSmoothness: 16,
    thoughtFadeDuration: 300,
    floatEasing: 'ease-in-out',
  },
  
  floatMotion: {
    enabled: true,
    amplitude: { x: 3, y: 4 },
    frequency: 0.002,
    boundsPadding: 16,
    dragZoomScale: 1.15,
    dragZoomDuration: 150,
  },
  
  roaming: {
    enabled: true,
    interval: { min: 15000, max: 28000 }, // 15-28 seconds between moves - much calmer
    moveDuration: 2800, // 2.8 seconds - slower, smoother movement
    pauseDuration: { min: 8000, max: 18000 }, // Longer pauses between roams
    boundsPadding: 120,
    avoidEdges: true,
    preferCorners: false,
    transportEffects: {
      enabled: true,
      randomizeEffect: true,
      effects: [
        { type: 'glide', duration: 2800, trailEnabled: true, sparkleEnabled: true, glowColor: '#38bdf8' },
        { type: 'zap', duration: 1200, trailEnabled: true, sparkleEnabled: true, glowColor: '#a855f7' },
        { type: 'float', duration: 3500, trailEnabled: true, sparkleEnabled: true, glowColor: '#38bdf8' },
        { type: 'dash', duration: 1600, trailEnabled: true, sparkleEnabled: true, glowColor: '#a855f7' },
      ],
    },
    reactions: {
      startMoving: [
        "Time to explore!",
        "Off I go~",
        "Adventure awaits!",
        "Let me check things out...",
        "Wandering around...",
        "Zooming over!",
        "Gliding across!",
      ],
      reachedDestination: [
        "Nice spot!",
        "Here's good.",
        "Found a cozy corner!",
        "This looks interesting...",
        "Setting up here!",
        "Landed safely!",
      ],
      exploring: [
        "Checking the platform...",
        "Looking for ways to help!",
        "Monitoring things...",
        "Keeping an eye out!",
        "Scanning for insights...",
      ],
    },
  },
  
  reactions: {
    movement: {
      slow: ['La la la~', 'Floating along...', 'Wheee~'],
      fast: ['Wee!', 'Zoom zoom!', 'Faster!', 'Woohoo!'],
      veryFast: ["I'm gonna get sick!", 'Slow down!', 'Too fast!', 'AHHH!'],
      stop: ['Phew!', 'That was fun!', 'Again?', 'Dizzy...'],
    },
    tap: {
      single: ['Ouch!', 'Hey!', 'That tickles!', 'Watch it!', "I'm gonna snitch to HR!"],
      double: ['Double trouble!', 'Stop that!', 'Okay okay!', 'I felt that twice!'],
      longPress: ['Let go!', "You're squishing me!", 'Help!', 'Personal space!'],
    },
    drag: {
      start: ['Where we going?', 'Adventure time!', 'Lead the way!'],
      moving: ['Wee!', 'Fun ride!', 'Keep going!', 'Watch the edges!'],
      end: ['Nice spot!', 'Here is good', 'Perfect!', 'Home sweet home'],
    },
    idle: {
      short: ['Hmm?', 'Yes?', 'Need help?'],
      medium: ['Still here!', 'Just thinking...', 'Observing...', 'Taking notes...'],
      long: ['Zzz...', 'Wake me if you need me', 'So quiet...', '*yawns*'],
    },
  },
  
  holidays: [
    {
      key: 'new_year',
      name: 'New Year',
      dateRange: { startMonth: 12, startDay: 31, endMonth: 1, endDay: 2 },
      thoughts: ['Happy New Year!', 'New year, new goals!', 'Time for fresh starts!', 'Lets make this year great!'],
      greeting: 'Happy New Year! Ready to crush those goals?',
    },
    {
      key: 'valentines',
      name: 'Valentines Day',
      dateRange: { startMonth: 2, startDay: 13, endMonth: 2, endDay: 15 },
      thoughts: ['Love is in the air!', 'Spread the love!', 'Be my business valentine?'],
      greeting: 'Happy Valentines Day! Your business deserves some love too!',
    },
    {
      key: 'spring',
      name: 'Spring',
      dateRange: { startMonth: 3, startDay: 20, endMonth: 4, endDay: 20 },
      thoughts: ['Spring into action!', 'Time to bloom!', 'Fresh beginnings!'],
      greeting: 'Spring is here! Time for growth and new opportunities!',
    },
    {
      key: 'easter',
      name: 'Easter',
      dateRange: { startMonth: 3, startDay: 28, endMonth: 4, endDay: 17 },
      thoughts: ['Egg-cellent day!', 'Hop to it!', 'Easter treats!'],
      greeting: 'Happy Easter! May your business find some golden eggs!',
    },
    {
      key: 'summer',
      name: 'Summer',
      dateRange: { startMonth: 6, startDay: 21, endMonth: 8, endDay: 31 },
      thoughts: ['Sunny vibes!', 'Summer success!', 'Hot opportunities!'],
      greeting: 'Summer is here! Keep your cool while crushing goals!',
    },
    {
      key: 'halloween',
      name: 'Halloween',
      dateRange: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 1 },
      thoughts: ['Boo!', 'Spooky savings!', 'Trick or treat!', 'Scary good results!'],
      greeting: 'Happy Halloween! May your competition be scared of your success!',
    },
    {
      key: 'thanksgiving',
      name: 'Thanksgiving',
      dateRange: { startMonth: 11, startDay: 20, endMonth: 11, endDay: 28 },
      thoughts: ['Grateful for you!', 'Thankful season!', 'Count your blessings!'],
      greeting: 'Happy Thanksgiving! Grateful for your business success!',
    },
    {
      key: 'christmas',
      name: 'Christmas',
      dateRange: { startMonth: 12, startDay: 1, endMonth: 12, endDay: 26 },
      thoughts: ['Ho ho ho!', 'Merry and bright!', 'Tis the season!', 'Gift of success!'],
      greeting: 'Merry Christmas! May your business be merry and profitable!',
    },
  ],
  
  ai: {
    enabled: true,
    updateCheckInterval: 300000,
    faqPollInterval: 600000,
    insightInterval: 900000,
    endpoints: {
      insights: '/api/mascot/insights',
      faqs: '/api/mascot/faqs',
      tasks: '/api/mascot/tasks',
      advice: '/api/mascot/advice',
    },
    updateAnnouncements: [
      'I feel an update coming...',
      'New info incoming!',
      'Stand by for news...',
      'Got something for you!',
    ],
    businessAdviceCategories: [
      'retail',
      'restaurant',
      'healthcare',
      'technology',
      'consulting',
      'manufacturing',
      'hospitality',
      'education',
      'finance',
      'construction',
    ],
  },
  
  taskTemplates: [
    {
      id: 'complete-profile',
      title: 'Complete Your Profile',
      description: 'Add your business details to unlock personalized insights',
      category: 'setup',
      points: 50,
      priority: 'high',
    },
    {
      id: 'add-team-member',
      title: 'Add Your First Team Member',
      description: 'Invite a colleague to start collaborating',
      category: 'team',
      points: 30,
      priority: 'medium',
    },
    {
      id: 'set-schedule',
      title: 'Set Up Your Schedule',
      description: 'Configure your availability for optimal workforce management',
      category: 'scheduling',
      points: 40,
      priority: 'high',
    },
    {
      id: 'explore-analytics',
      title: 'Explore Analytics Dashboard',
      description: 'Discover insights about your workforce performance',
      category: 'discovery',
      points: 20,
      priority: 'low',
    },
    {
      id: 'connect-payroll',
      title: 'Connect Payroll',
      description: 'Link your payment processing for seamless operations',
      category: 'integration',
      points: 60,
      priority: 'high',
    },
  ],
  
  thoughts: {
    enabled: true,
    displayDuration: 22000, // 22 seconds - plenty of time for humans to read
    rotateInterval: 30000, // 30 seconds between auto thoughts
    emoticons: {
      IDLE: '✨',
      SEARCHING: '🔍',
      THINKING: '💭',
      ANALYZING: '⚙️',
      CODING: '💻',
      LISTENING: '👂',
      UPLOADING: '📤',
      SUCCESS: '✅',
      ERROR: '❌',
      CELEBRATING: '🎉',
      ADVISING: '💡',
      HOLIDAY: '🎄',
      GREETING: '👋',
    },
    defaultThoughts: {
      IDLE: [
        "Hey! I'm here if you need anything.",
        "Taking a quick break? Good for you!",
        "I noticed you're doing great work today.",
        "Need help with something? Just let me know!",
        "Your workforce dashboard is looking good.",
      ],
      SEARCHING: [
        "Looking through your records now...",
        "Searching for what you need...",
        "Scanning your data - one moment!",
      ],
      THINKING: [
        "Let me think about the best approach...",
        "Processing your request...",
        "Analyzing this for you...",
        "Interesting question - working on it!",
      ],
      ANALYZING: [
        "Examining your workforce data...",
        "Breaking down the numbers...",
        "Finding insights for you...",
      ],
      CODING: [
        "Making some improvements...",
        "Optimizing things behind the scenes...",
        "Building something helpful...",
      ],
      LISTENING: [
        "I'm listening - tell me more!",
        "Got it, continue when you're ready.",
        "I hear you! What else?",
      ],
      UPLOADING: [
        "Sending your data securely...",
        "Almost there - uploading now...",
        "Processing your files...",
      ],
      SUCCESS: [
        "All done! That went smoothly.",
        "Perfect! Everything worked great.",
        "Nice work! Task completed.",
      ],
      ERROR: [
        "Hmm, something didn't work. Let me help.",
        "Don't worry - we can fix this together.",
        "Ran into an issue. I'll help sort it out.",
      ],
      CELEBRATING: [
        "Amazing job! Keep it up!",
        "You're crushing it today!",
        "That deserves a celebration!",
      ],
      ADVISING: [
        "Quick tip: Try the keyboard shortcuts for faster navigation.",
        "Did you know you can customize your dashboard?",
        "Pro tip: Check the analytics for workforce insights.",
      ],
      HOLIDAY: [
        "Happy holidays from the team!",
        "Wishing you a wonderful season!",
        "Enjoy the festive spirit!",
      ],
      GREETING: [
        "Welcome! I'm Trinity, your AI business buddy.",
        "Great to see you! Tap me anytime for help.",
        "Hey there! Ready to make today productive?",
        "Hello! I'm here to help with scheduling, payroll, and more.",
        "Welcome back! What can I help you with?",
      ],
    },
  },
  
  breakpoints: {
    mobile: 640,
    tablet: 1024,
    desktop: 1280,
  },
};

export function shouldHideMascot(pathname: string): boolean {
  return MASCOT_CONFIG.hiddenRoutes.some(route => pathname.startsWith(route));
}

export function getMascotMode(pathname: string, aiState?: string): MascotMode {
  if (aiState) {
    return aiState as MascotMode;
  }
  return MASCOT_CONFIG.defaultMode;
}

export function getCurrentHoliday(): HolidayConfig | null {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  for (const holiday of MASCOT_CONFIG.holidays) {
    const { startMonth, startDay, endMonth, endDay } = holiday.dateRange;
    
    if (startMonth <= endMonth) {
      if ((month > startMonth || (month === startMonth && day >= startDay)) &&
          (month < endMonth || (month === endMonth && day <= endDay))) {
        return holiday;
      }
    } else {
      if ((month > startMonth || (month === startMonth && day >= startDay)) ||
          (month < endMonth || (month === endMonth && day <= endDay))) {
        return holiday;
      }
    }
  }
  
  return null;
}

export function getDeviceSizes(): MascotSizes {
  if (typeof window === 'undefined') return MASCOT_CONFIG.desktop;
  
  const width = window.innerWidth;
  const { mobile, tablet } = MASCOT_CONFIG.breakpoints;
  
  // Mobile: compact mascot for small screens
  if (width < mobile) {
    return MASCOT_CONFIG.mobile;
  }
  
  // Tablet: interpolated sizing between mobile and desktop
  if (width < tablet) {
    const factor = (width - mobile) / (tablet - mobile);
    const m = MASCOT_CONFIG.mobile;
    const d = MASCOT_CONFIG.desktop;
    
    return {
      bubble: Math.round(m.bubble + (d.bubble - m.bubble) * factor * 0.6),
      defaultSize: Math.round(m.defaultSize + (d.defaultSize - m.defaultSize) * factor * 0.6),
      expandedSize: Math.round(m.expandedSize + (d.expandedSize - m.expandedSize) * factor * 0.6),
      minSize: Math.round(m.minSize + (d.minSize - m.minSize) * factor * 0.5),
      maxSize: Math.round(m.maxSize + (d.maxSize - m.maxSize) * factor * 0.5),
    };
  }
  
  // Desktop: full-sized mascot
  return MASCOT_CONFIG.desktop;
}

export function getRandomReaction(type: keyof Reactions, intensity?: string): string {
  const reactions = MASCOT_CONFIG.reactions[type];
  const options = intensity && intensity in reactions 
    ? reactions[intensity as keyof typeof reactions] 
    : Object.values(reactions).flat();
  return options[Math.floor(Math.random() * options.length)];
}

export function getRandomThought(mode: MascotMode): string {
  const thoughts = MASCOT_CONFIG.thoughts.defaultThoughts[mode];
  if (!thoughts || thoughts.length === 0) return '';
  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

export function getEmoticon(mode: MascotMode): string {
  return MASCOT_CONFIG.thoughts.emoticons[mode] || '✨';
}

export default MASCOT_CONFIG;
