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
  | 'HOLIDAY';

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
      purple: { scale: 1.1, wobble: 0.8, glow: 0.6, speed: 1.3 },
      cyan: { scale: 1.1, wobble: 0.8, glow: 0.6, speed: 1.3 },
    },
    particleEffect: 'sparkle',
  },
  excited: {
    type: 'excited',
    duration: 4000,
    starBehavior: {
      purple: { scale: 1.2, wobble: 1.5, glow: 0.8, speed: 2 },
      cyan: { scale: 1.2, wobble: 1.5, glow: 0.8, speed: 2 },
    },
    particleEffect: 'stars',
  },
  curious: {
    type: 'curious',
    duration: 2500,
    starBehavior: {
      purple: { scale: 0.9, wobble: 0.3, glow: 0.5, speed: 0.7 },
      cyan: { scale: 1.15, wobble: 0.6, glow: 0.7, speed: 1.2 },
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
      purple: { scale: 1.3, wobble: 2, glow: 0.9, speed: 2.5 },
      cyan: { scale: 1.3, wobble: 2, glow: 0.9, speed: 2.5 },
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
    interval: { min: 12000, max: 30000 },
    moveDuration: 2500,
    pauseDuration: { min: 8000, max: 20000 },
    boundsPadding: 150,
    avoidEdges: true,
    preferCorners: false,
    transportEffects: {
      enabled: true,
      randomizeEffect: true,
      effects: [
        { type: 'glide', duration: 2200, trailEnabled: true, sparkleEnabled: false, glowColor: '#38bdf8' },
        { type: 'zap', duration: 400, trailEnabled: false, sparkleEnabled: true, glowColor: '#a855f7' },
        { type: 'float', duration: 3000, trailEnabled: false, sparkleEnabled: false, glowColor: '#38bdf8' },
        { type: 'dash', duration: 900, trailEnabled: true, sparkleEnabled: true, glowColor: '#a855f7' },
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
      dateRange: { startMonth: 12, startDay: 20, endMonth: 12, endDay: 26 },
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
    displayDuration: 4000,
    rotateInterval: 8000,
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
    },
    defaultThoughts: {
      IDLE: ['Hmm?', 'Ready to help!', 'What next?', 'Standing by...', 'I see you working hard!'],
      SEARCHING: ['Searching...', 'Looking for it...', 'Scanning the data...'],
      THINKING: ['Processing...', 'Let me think...', 'Analyzing...', 'Hmm, interesting...'],
      ANALYZING: ['Examining data...', 'Breaking it down...', 'Computing insights...'],
      CODING: ['Writing code...', 'Debugging...', 'Compiling...', 'Building magic...'],
      LISTENING: ["I'm listening...", 'Tell me more...', 'Got it...', 'I hear you!'],
      UPLOADING: ['Sending...', 'Uploading...', 'Processing files...'],
      SUCCESS: ['All done!', 'Perfect!', 'Nailed it!', 'You rock!'],
      ERROR: ['Oops!', 'Something went wrong', 'Let me help fix this...'],
      CELEBRATING: ['Amazing!', 'You did it!', 'Party time!', 'Woohoo!'],
      ADVISING: ['Pro tip:', 'Did you know?', 'Quick advice:', 'Heres an idea!'],
      HOLIDAY: ['Festive vibes!', 'Celebrate!', 'Special day!'],
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
  return window.innerWidth < MASCOT_CONFIG.breakpoints.mobile 
    ? MASCOT_CONFIG.mobile 
    : MASCOT_CONFIG.desktop;
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
