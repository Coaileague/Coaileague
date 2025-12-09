/**
 * Trinity Configuration - Your Business Success Partner
 * 
 * Central configuration for Trinity, your dedicated business success guide.
 * Edit this file to change Trinity's behavior platform-wide.
 * NO page-by-page changes required - all settings flow from here.
 * 
 * Who is Trinity?
 * Trinity is your organization's intelligent business companion - a three-star
 * constellation that guides org creators and leaders toward business success.
 * She understands workforce management, scheduling, payroll, and team dynamics.
 * 
 * Features:
 * - Business insights and growth recommendations
 * - Task generation for things you need to accomplish
 * - Live FAQ and help integration
 * - Self-resizing based on device/screen
 * - Holiday-aware personality and greetings
 * - Contextual reactions (movement, taps, drag)
 * - Gamification and achievement guidance
 * 
 * Access Control:
 * Trinity is available exclusively for:
 * - Organization creators (org_owner)
 * - Root administrators (root_admin, deputy_admin, sysop)
 * - Support roles (support_manager, support_agent)
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

// ============================================================================
// VOICE COMMAND CONFIGURATION (AI Brain editable)
// Settings for voice control integration with Trinity
// ============================================================================

export interface VoiceCommandConfig {
  enabled: boolean;
  mobileEnabled: boolean;        // Enable voice on mobile specifically
  wakeWord: string;              // Wake word to activate Trinity ("Hey Trinity")
  listenTimeout: number;         // How long to listen after wake word (ms)
  visualFeedback: boolean;       // Show visual indicator when listening
  hapticFeedback: boolean;       // Vibrate on mobile when listening starts
  commands: {
    openChat: string[];          // Phrases to open chat
    closeChat: string[];         // Phrases to close chat
    readNotifications: string[]; // Phrases to read notifications
    navigateTo: string[];        // Phrases to navigate (followed by destination)
    askQuestion: string[];       // Phrases to ask Trinity a question
    cancel: string[];            // Phrases to cancel current action
  };
  responseSpeed: {
    mobile: 'slow' | 'medium' | 'fast';   // Human-paced responses on mobile
    desktop: 'slow' | 'medium' | 'fast';
  };
}

export const VOICE_COMMAND_CONFIG: VoiceCommandConfig = {
  enabled: true,
  mobileEnabled: true,
  wakeWord: 'Hey Trinity',
  listenTimeout: 5000,           // 5 seconds to speak after wake word
  visualFeedback: true,
  hapticFeedback: true,
  commands: {
    openChat: ['open chat', 'start chat', 'chat with me', 'talk to me'],
    closeChat: ['close chat', 'end chat', 'goodbye', 'bye'],
    readNotifications: ['read notifications', 'what\'s new', 'any updates'],
    navigateTo: ['go to', 'navigate to', 'open', 'show me'],
    askQuestion: ['tell me about', 'what is', 'how do I', 'explain'],
    cancel: ['cancel', 'stop', 'never mind', 'forget it'],
  },
  responseSpeed: {
    mobile: 'slow',    // Human-paced for mobile - easier to read
    desktop: 'medium',
  },
};

// ============================================================================
// CHAT RESPONSE TIMING CONFIGURATION (AI Brain editable)
// Human-paced response timing for natural conversation feel
// ============================================================================

export interface ChatResponseTimingConfig {
  // Typing indicator timing (ms)
  typingDelay: {
    mobile: number;
    desktop: number;
  };
  // Characters revealed per second (typewriter effect)
  charactersPerSecond: {
    mobile: number;
    desktop: number;
  };
  // Minimum display time for responses (ms)
  minDisplayTime: {
    mobile: number;
    desktop: number;
  };
  // Pause between response bubbles (ms)
  bubbleGap: {
    mobile: number;
    desktop: number;
  };
  // Enable typewriter effect
  typewriterEnabled: boolean;
}

export const CHAT_RESPONSE_TIMING: ChatResponseTimingConfig = {
  typingDelay: {
    mobile: 1500,   // Show typing indicator longer on mobile - builds anticipation
    desktop: 900,
  },
  charactersPerSecond: {
    mobile: 20,     // Very slow typing on mobile - easy to read animations
    desktop: 40,
  },
  minDisplayTime: {
    mobile: 5000,   // Keep responses visible 5s on mobile
    desktop: 3000,
  },
  bubbleGap: {
    mobile: 1000,   // 1 second pause between bubbles on mobile
    desktop: 500,
  },
  typewriterEnabled: true,
};

// ============================================================================
// CHAT BUBBLE VISUAL CONFIGURATION (AI Brain editable)
// Styling and animation settings for Trinity chat bubbles
// ============================================================================

export interface ChatBubbleVisualConfig {
  // Bubble sizing
  maxWidth: {
    mobile: string;
    desktop: string;
  };
  padding: {
    mobile: string;
    desktop: string;
  };
  fontSize: {
    mobile: string;
    desktop: string;
  };
  // Animation settings
  fadeInDuration: number;
  slideDistance: number;
  // Visual effects
  glassmorphism: boolean;
  borderGlow: boolean;
  shadowIntensity: 'subtle' | 'medium' | 'strong';
}

export const CHAT_BUBBLE_VISUALS: ChatBubbleVisualConfig = {
  maxWidth: {
    mobile: '85vw',    // Wide bubbles on mobile for readability
    desktop: '320px',
  },
  padding: {
    mobile: '14px 18px',  // Generous padding on mobile
    desktop: '12px 16px',
  },
  fontSize: {
    mobile: '15px',    // Slightly larger text on mobile
    desktop: '14px',
  },
  fadeInDuration: 300,
  slideDistance: 12,
  glassmorphism: true,
  borderGlow: true,
  shadowIntensity: 'medium',
};

export function getChatBubbleStyle(isMobile: boolean) {
  return {
    maxWidth: isMobile ? CHAT_BUBBLE_VISUALS.maxWidth.mobile : CHAT_BUBBLE_VISUALS.maxWidth.desktop,
    padding: isMobile ? CHAT_BUBBLE_VISUALS.padding.mobile : CHAT_BUBBLE_VISUALS.padding.desktop,
    fontSize: isMobile ? CHAT_BUBBLE_VISUALS.fontSize.mobile : CHAT_BUBBLE_VISUALS.fontSize.desktop,
    fadeInDuration: CHAT_BUBBLE_VISUALS.fadeInDuration,
    slideDistance: CHAT_BUBBLE_VISUALS.slideDistance,
    glassmorphism: CHAT_BUBBLE_VISUALS.glassmorphism,
    borderGlow: CHAT_BUBBLE_VISUALS.borderGlow,
    shadowIntensity: CHAT_BUBBLE_VISUALS.shadowIntensity,
  };
}

export function getChatTiming(isMobile: boolean): {
  typingDelay: number;
  charactersPerSecond: number;
  minDisplayTime: number;
  bubbleGap: number;
  typewriterEnabled: boolean;
} {
  return {
    typingDelay: isMobile ? CHAT_RESPONSE_TIMING.typingDelay.mobile : CHAT_RESPONSE_TIMING.typingDelay.desktop,
    charactersPerSecond: isMobile ? CHAT_RESPONSE_TIMING.charactersPerSecond.mobile : CHAT_RESPONSE_TIMING.charactersPerSecond.desktop,
    minDisplayTime: isMobile ? CHAT_RESPONSE_TIMING.minDisplayTime.mobile : CHAT_RESPONSE_TIMING.minDisplayTime.desktop,
    bubbleGap: isMobile ? CHAT_RESPONSE_TIMING.bubbleGap.mobile : CHAT_RESPONSE_TIMING.bubbleGap.desktop,
    typewriterEnabled: CHAT_RESPONSE_TIMING.typewriterEnabled,
  };
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
  
  // Onboarding triggers
  { trigger: 'org_created', emote: 'celebrating', priority: 5 },
  { trigger: 'invitation_sent', emote: 'happy', priority: 4 },
  { trigger: 'invitation_accepted', emote: 'celebrating', priority: 5 },
  { trigger: 'role_assigned', emote: 'helpful', priority: 3 },
  { trigger: 'client_welcome_sent', emote: 'waving', priority: 3 },
  { trigger: 'employee_onboarded', emote: 'proud', priority: 5 },
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

// Quality tier presets - CRISP rendering, no fuzzy glow effects
export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: 'high',
    maxDPR: 2.5,
    targetFPS: 60,
    glowIntensity: 0,
    glowBlurRadius: 0,
    particleCount: 12,
    ledCount: 8,
    shadowQuality: 'simple',
    enableRimLight: false,
    enableInnerGlow: false,
    haloAlpha: 0,
    animationSmoothing: 1.0,
  },
  medium: {
    tier: 'medium',
    maxDPR: 2.0,
    targetFPS: 45,
    glowIntensity: 0,
    glowBlurRadius: 0,
    particleCount: 8,
    ledCount: 5,
    shadowQuality: 'simple',
    enableRimLight: false,
    enableInnerGlow: false,
    haloAlpha: 0,
    animationSmoothing: 0.8,
  },
  low: {
    tier: 'low',
    maxDPR: 1.5,
    targetFPS: 30,
    glowIntensity: 0,
    glowBlurRadius: 0,
    particleCount: 4,
    ledCount: 3,
    shadowQuality: 'none',
    enableRimLight: false,
    enableInnerGlow: false,
    haloAlpha: 0,
    animationSmoothing: 0.6,
  },
};

export const PERFORMANCE_CONFIG: PerformanceConfig = {
  enableAdaptiveQuality: true,
  frameBudgetMs: 16.67, // 60 FPS target
  idleThrottleDelay: 3000, // 3 seconds of idle before throttling (faster throttle)
  idleTargetFPS: 12, // Lower idle FPS for better battery life
  qualityUpgradeThreshold: 55, // FPS threshold to upgrade quality
  qualityDowngradeThreshold: 30, // More aggressive downgrade threshold for mobile
  measurementWindow: 2000, // 2 seconds - faster tier adaptation
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
// - Clearance gap is VERY TIGHT (8px desktop, 6px mobile) - bubble hugs the mascot
// - Collision avoidance shifts bubble left/right/below when mascot is near screen edges
// - Text uses subtle shadow (0.35 opacity) for readability without blocking mascot
// - No borders, no box shadows - pure glassmorphism with 2px blur
export const THOUGHT_BUBBLE_BOUNDARY_CONFIG = {
  offsetAbove: 4, // pixels above mascot
  maxWidth: 220,   // max bubble width on desktop - tighter for close anchoring
  mobileMaxWidth: 130, // max bubble width on mobile - compact for small screens
  padding: 3,
  anchorToMascot: true, // always stay attached to mascot position
  followMascotDrag: true, // move with mascot when dragged
  clearanceGap: { desktop: 6, mobile: 4 }, // TIGHT gap - bubble hugs the mascot
  collisionAvoidance: true, // shift bubble to avoid covering mascot on edge cases
  backgroundOpacity: { center: 0.14, edge: 0.04 }, // nearly transparent radial gradient
  backdropBlur: 2, // minimal blur in pixels
};

// ============================================================================
// ACTION STATE TEXT CONFIGURATION
// Maps MascotMode to action indicator text shown in thought bubble
// These show dynamic activity like "thinking..." "coding..." etc.
// ============================================================================

export const ACTION_STATE_TEXT: Record<MascotMode, string> = {
  IDLE: 'chilling',
  SEARCHING: 'observing',
  THINKING: 'thinking',
  ANALYZING: 'analyzing data',
  CODING: 'coding',
  LISTENING: 'listening',
  UPLOADING: 'automating',
  SUCCESS: 'done',
  ERROR: 'oops',
  CELEBRATING: 'celebrating',
  ADVISING: 'talking to AI brain',
  HOLIDAY: 'celebrating',
  GREETING: 'waving hello',
};

// Seasonal action state overrides - used during specific holidays
export const SEASONAL_ACTION_TEXT: Partial<Record<HolidayKey, Record<MascotMode, string>>> = {
  christmas: {
    IDLE: 'flying through snow',
    SEARCHING: 'searching for gifts',
    THINKING: 'dreaming of snow',
    ANALYZING: 'checking the nice list',
    CODING: 'wrapping code presents',
    LISTENING: 'listening for sleigh bells',
    UPLOADING: 'delivering presents',
    SUCCESS: 'ho ho ho',
    ERROR: 'lost in the snow',
    CELEBRATING: 'jingle belling',
    ADVISING: 'talking to Santa AI',
    HOLIDAY: 'spreading holiday cheer',
    GREETING: 'merry greetings',
  },
  halloween: {
    IDLE: 'lurking in shadows',
    SEARCHING: 'hunting for candy',
    THINKING: 'conjuring spells',
    ANALYZING: 'reading fortunes',
    CODING: 'brewing potions',
    LISTENING: 'hearing whispers',
    UPLOADING: 'summoning spirits',
    SUCCESS: 'trick or treat',
    ERROR: 'curse failed',
    CELEBRATING: 'haunting happily',
    ADVISING: 'consulting the spirits',
    HOLIDAY: 'spooky vibes',
    GREETING: 'boo',
  },
  valentines: {
    IDLE: 'feeling the love',
    SEARCHING: 'looking for hearts',
    THINKING: 'daydreaming',
    ANALYZING: 'measuring love',
    CODING: 'writing love letters',
    LISTENING: 'hearing heartbeats',
    UPLOADING: 'sending valentines',
    SUCCESS: 'love wins',
    ERROR: 'heartbroken',
    CELEBRATING: 'spreading love',
    ADVISING: 'cupid consulting',
    HOLIDAY: 'loving life',
    GREETING: 'xoxo',
  },
};

// Get action text for a mode, with seasonal override support
export function getActionText(mode: MascotMode, holidayKey?: HolidayKey | null): string {
  // Check for seasonal override first
  if (holidayKey && SEASONAL_ACTION_TEXT[holidayKey]?.[mode]) {
    return SEASONAL_ACTION_TEXT[holidayKey][mode]!;
  }
  // Fall back to default action text
  return ACTION_STATE_TEXT[mode] || 'working';
}

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
  
  // Page-specific promotional thoughts - AI-driven professional messaging
  pageSpecificThoughts: {
    '/': [
      { text: "Welcome to CoAIleague. How may I assist with your workforce management needs?", ctaText: "View Plans", ctaLink: "/pricing", priority: 'high', emote: 'waving', showDiscount: true },
      { text: "I'm Trinity, your AI assistant. I'm available to help with any questions.", priority: 'normal', emote: 'helpful' },
      { text: "CoAIleague provides AI-powered scheduling, payroll automation, and business insights.", ctaText: "Learn More", ctaLink: "/pricing", priority: 'normal', emote: 'curious' },
      { text: "Many businesses have improved efficiency with our platform.", ctaText: "Start Free Trial", ctaLink: "/register", priority: 'high', emote: 'nodding', showDiscount: true },
    ],
    '/pricing': [
      { text: "I can help you compare our plans. What questions do you have?", priority: 'normal', emote: 'helpful' },
      { text: "The Professional plan includes unlimited AI scheduling features.", priority: 'normal', emote: 'nodding' },
      { text: "New subscribers receive a discount on the first month.", priority: 'high', emote: 'nodding', showDiscount: true },
      { text: "I can provide a comparison based on your business requirements.", priority: 'normal', emote: 'helpful' },
      { text: "For enterprise requirements, our team offers custom solutions.", ctaText: "Contact Sales", ctaLink: "/contact", priority: 'normal', emote: 'helpful' },
    ],
    '/contact': [
      { text: "Our team is ready to assist with your inquiries.", priority: 'normal', emote: 'helpful' },
      { text: "Our support team maintains an average response time under 2 hours.", priority: 'normal', emote: 'nodding' },
      { text: "For enterprise feature questions, our specialists are available to help.", priority: 'normal', emote: 'helpful' },
    ],
    '/support': [
      { text: "I'm available to assist. You may also submit a form for our support team.", priority: 'normal', emote: 'helpful' },
      { text: "I can answer questions about CoAIleague features and functionality.", priority: 'normal', emote: 'waving' },
    ],
    '/features': [
      { text: "I can provide information about our platform features.", priority: 'normal', emote: 'helpful' },
      { text: "AI-powered scheduling has been shown to save significant time weekly.", priority: 'high', emote: 'nodding' },
      { text: "Free trial available to explore all features.", ctaText: "Start Trial", ctaLink: "/register", priority: 'high', emote: 'nodding', showDiscount: true },
    ],
    '/homepage': [
      { text: "Welcome. I'm your AI workforce assistant. How may I help?", priority: 'normal', emote: 'waving' },
      { text: "Ready to optimize your business operations?", ctaText: "Get Started", ctaLink: "/register", priority: 'high', emote: 'nodding', showDiscount: true },
    ],
    '/login': [
      { text: "Welcome back. I'm Trinity, available to assist with sign-in.", priority: 'normal', emote: 'waving' },
      { text: "Password assistance is available via 'Forgot Password' below.", priority: 'normal', emote: 'helpful' },
      { text: "New users may create an account to get started.", ctaText: "Sign Up", ctaLink: "/register", priority: 'normal', emote: 'helpful' },
      { text: "If you need login assistance, I'm here to help.", priority: 'normal', emote: 'helpful' },
    ],
    '/register': [
      { text: "Welcome to CoAIleague. I can guide you through the registration process.", priority: 'normal', emote: 'helpful' },
      { text: "We recommend using a strong password for account security.", priority: 'normal', emote: 'helpful' },
      { text: "Existing account holders may sign in instead.", ctaText: "Sign In", ctaLink: "/login", priority: 'normal', emote: 'waving' },
      { text: "I can help you select the right plan for your needs.", priority: 'normal', emote: 'helpful' },
      { text: "Welcome. Your workforce management solution awaits.", priority: 'high', emote: 'nodding' },
    ],
    '/forgot-password': [
      { text: "Enter your email address to receive password reset instructions.", priority: 'normal', emote: 'helpful' },
      { text: "The reset link will be sent promptly after submission.", priority: 'normal', emote: 'nodding' },
    ],
  },
  
  // General promo thoughts (used on any public page) - professional messaging
  generalPromos: [
    { text: "CoAIleague automates scheduling, payroll, invoicing, and business operations.", priority: 'normal', emote: 'helpful' },
    { text: "Trusted by businesses for AI-powered workforce management.", priority: 'normal', emote: 'nodding' },
    { text: "New subscriber discount available.", ctaText: "Learn More", ctaLink: "/register", priority: 'high', emote: 'nodding', showDiscount: true },
    { text: "I'm available to answer your questions.", priority: 'normal', emote: 'helpful' },
    { text: "I can explain our AI workforce management capabilities.", priority: 'normal', emote: 'helpful' },
  ],
  
  // First-time visitor greeting - professional
  greetingThoughts: [
    { text: "Welcome to CoAIleague. I'm Trinity, your AI assistant.", priority: 'high', emote: 'waving' },
    { text: "First time visiting? I can provide an overview of our platform.", ctaText: "Learn More", ctaLink: "/pricing", priority: 'high', emote: 'helpful' },
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
  allowedRoles: {
    platform: string[];
    workspace: string[];
  };
  idleModeRoutes: string[];
  publicPageRoutes: string[];
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
    bubble: 180,
    defaultSize: 180,
    expandedSize: 220,
    minSize: 150,
    maxSize: 260,
  },
  
  mobile: {
    bubble: 130,       // Large bubble for easy reading on small screens
    defaultSize: 130,  // 130px - highly visible on mobile, easy to tap
    expandedSize: 160, // Expanded for chat/interaction mode
    minSize: 110,      // Never too small to see animations
    maxSize: 180,      // Cap for very small screens
  },
  
  defaultPosition: {
    x: 16,
    y: 16,
  },
  
  mobileDefaultPosition: {
    x: 12,
    y: 12,
  },
  
  zIndex: 10001,
  
  storageKeys: {
    position: 'coaileague-mascot-position',
    expanded: 'coaileague-mascot-expanded',
    tasks: 'coaileague-mascot-tasks',
  },
  
  hiddenRoutes: [
    '/mascot-demo',
    '/chat',
    '/helpdesk',
    '/timesheet',
    '/payroll',
    '/invoicing',
    '/schedule',
    '/settings',
    '/admin',
    '/time-clock',
  ],
  
  allowedRoles: {
    platform: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'],
    workspace: ['org_owner'],
  },
  
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
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
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
        "Repositioning to assist...",
        "Moving to optimal location...",
        "Adjusting position...",
        "Navigating to new position...",
        "Changing location...",
      ],
      reachedDestination: [
        "Position set.",
        "Ready to assist.",
        "Optimal location reached.",
        "Standing by here.",
        "In position.",
      ],
      exploring: [
        "Monitoring platform activity...",
        "Reviewing current status...",
        "Checking for updates...",
        "Scanning for opportunities to help...",
        "Analyzing current state...",
      ],
    },
  },
  
  reactions: {
    movement: {
      slow: ['Moving to assist...', 'Repositioning...', 'Adjusting position...'],
      fast: ['On my way!', 'Coming right over!', 'Moving quickly!'],
      veryFast: ['Rapid transit mode!', 'Express repositioning!', 'High-speed assist!'],
      stop: ['Ready to help!', 'Standing by.', 'At your service.'],
    },
    tap: {
      single: ['How can I help?', 'Yes?', 'At your service.', 'What do you need?', 'Ready to assist!'],
      double: ['Opening chat...', 'How may I assist you?', 'Ready for your request.', 'I\'m listening.'],
      longPress: ['Menu opening...', 'Accessing options...', 'How can I help?', 'Opening assistance panel...'],
    },
    drag: {
      start: ['Moving as requested...', 'Repositioning...', 'Adjusting location...'],
      moving: ['On the move...', 'Repositioning...', 'Finding optimal position...', 'Adjusting...'],
      end: ['Position set.', 'Location saved.', 'Ready to assist.', 'Positioned for access.'],
    },
    idle: {
      short: ['How can I help?', 'Ready to assist.', 'At your service.'],
      medium: ['Standing by...', 'Monitoring...', 'Available if needed...', 'Ready when you are...'],
      long: ['Resting mode...', 'Available when needed.', 'Standing by...', 'Waiting to assist...'],
    },
  },
  
  holidays: [
    {
      key: 'new_year',
      name: 'New Year',
      dateRange: { startMonth: 12, startDay: 31, endMonth: 1, endDay: 2 },
      thoughts: ['Happy New Year.', 'Wishing you success in the new year.', 'A fresh start for new opportunities.'],
      greeting: 'Happy New Year. Best wishes for a successful year ahead.',
    },
    {
      key: 'valentines',
      name: 'Valentines Day',
      dateRange: { startMonth: 2, startDay: 13, endMonth: 2, endDay: 15 },
      thoughts: ['Happy Valentine\'s Day.', 'Wishing you well today.', 'Best regards this Valentine\'s Day.'],
      greeting: 'Happy Valentine\'s Day from the CoAIleague team.',
    },
    {
      key: 'spring',
      name: 'Spring',
      dateRange: { startMonth: 3, startDay: 20, endMonth: 4, endDay: 20 },
      thoughts: ['Spring season greetings.', 'A season of growth and opportunity.', 'Wishing you a productive spring.'],
      greeting: 'Welcome to spring. A time for growth and new opportunities.',
    },
    {
      key: 'easter',
      name: 'Easter',
      dateRange: { startMonth: 3, startDay: 28, endMonth: 4, endDay: 17 },
      thoughts: ['Happy Easter.', 'Easter greetings.', 'Wishing you a pleasant Easter.'],
      greeting: 'Happy Easter from the CoAIleague team.',
    },
    {
      key: 'summer',
      name: 'Summer',
      dateRange: { startMonth: 6, startDay: 21, endMonth: 8, endDay: 31 },
      thoughts: ['Summer greetings.', 'Wishing you a productive summer.', 'Best wishes this season.'],
      greeting: 'Summer greetings. Wishing you continued success.',
    },
    {
      key: 'halloween',
      name: 'Halloween',
      dateRange: { startMonth: 10, startDay: 25, endMonth: 11, endDay: 1 },
      thoughts: ['Happy Halloween.', 'Halloween greetings.', 'Seasonal wishes to you.'],
      greeting: 'Happy Halloween from the CoAIleague team.',
    },
    {
      key: 'thanksgiving',
      name: 'Thanksgiving',
      dateRange: { startMonth: 11, startDay: 20, endMonth: 11, endDay: 28 },
      thoughts: ['Happy Thanksgiving.', 'Grateful for your partnership.', 'Thanksgiving greetings.'],
      greeting: 'Happy Thanksgiving. We appreciate your business.',
    },
    {
      key: 'christmas',
      name: 'Christmas',
      dateRange: { startMonth: 12, startDay: 1, endMonth: 12, endDay: 26 },
      thoughts: ['Merry Christmas.', 'Season\'s greetings.', 'Wishing you a joyful holiday season.'],
      greeting: 'Merry Christmas from the CoAIleague team.',
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
      'Platform update available.',
      'New information received.',
      'Update notification pending.',
      'New update for your attention.',
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
    displayDuration: 15000, // 15 seconds - comfortable reading time
    rotateInterval: 10000, // 10 seconds between auto thoughts - keeps Trinity active and engaging
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
        "Hey there! Need anything?",
        "I'm here and ready to help!",
        "Tap me to chat - I love helping!",
        "I can help with scheduling, payroll, or analytics.",
        "Got questions? I've got answers!",
        "What would you like to explore today?",
        "Your workforce dashboard is looking good!",
        "Anything I can help you with?",
        "Just keeping an eye on things for you!",
        "Ready when you are!",
        "I'm analyzing your data in the background...",
        "All systems running smoothly!",
        "Want me to help optimize something?",
        "Psst... tap me for instant help!",
        "Standing by and ready to assist!",
      ],
      SEARCHING: [
        "Searching your records...",
        "Locating the requested information...",
        "Scanning business data...",
      ],
      THINKING: [
        "Processing your request...",
        "Analyzing the optimal approach...",
        "Evaluating options...",
        "Working on your request...",
      ],
      ANALYZING: [
        "Examining workforce metrics...",
        "Analyzing data for insights...",
        "Identifying actionable patterns...",
      ],
      CODING: [
        "Implementing improvements...",
        "Optimizing processes...",
        "Enhancing workflow efficiency...",
      ],
      LISTENING: [
        "Please continue.",
        "I'm following along.",
        "Understood. Please provide additional details if needed.",
      ],
      UPLOADING: [
        "Transmitting data securely...",
        "Upload in progress...",
        "Processing files securely...",
      ],
      SUCCESS: [
        "Complete. Ready for your next request.",
        "Task completed successfully.",
        "Operation successful.",
      ],
      ERROR: [
        "An issue occurred. I can help resolve it.",
        "I encountered an issue. Let me assist with resolution.",
        "There was an error. I'm available to help.",
      ],
      CELEBRATING: [
        "Excellent progress achieved.",
        "Goal accomplished successfully.",
        "Milestone reached.",
      ],
      ADVISING: [
        "Tip: Keyboard shortcuts can improve workflow efficiency.",
        "You can customize your dashboard view in settings.",
        "The analytics section provides deeper business insights.",
      ],
      HOLIDAY: [
        "Warm regards from the CoAIleague team.",
        "Best wishes for the holiday season.",
        "Season's greetings to you and your team.",
      ],
      GREETING: [
        "Welcome. I'm Trinity, your AI business assistant.",
        "Hello. I'm available to assist you.",
        "Welcome. How may I help you today?",
        "I'm Trinity. I can assist with scheduling, payroll, and more.",
        "Welcome back. How may I assist?",
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

export { 
  canAccessTrinity, 
  type TrinityAccessContext,
  type TrinityAccessResult 
} from '@shared/types';

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
