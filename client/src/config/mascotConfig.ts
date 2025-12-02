/**
 * Universal Mascot Configuration
 * 
 * Central configuration for the CoAI Twin mascot system.
 * Edit this file to change mascot behavior platform-wide.
 * NO page-by-page changes required - all settings flow from here.
 */

export interface MascotConfig {
  enabled: boolean;
  desktop: {
    defaultSize: number;
    expandedSize: number;
  };
  mobile: {
    defaultSize: number;
    expandedSize: number;
  };
  defaultPosition: { x: number; y: number };
  mobileDefaultPosition: { x: number; y: number };
  zIndex: number;
  storageKeys: {
    position: string;
    expanded: string;
  };
  hiddenRoutes: string[];
  idleModeRoutes: string[];
  defaultMode: MascotMode;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  animation: {
    transitionDuration: number;
    dragSmoothness: number;
  };
  thoughts: {
    enabled: boolean;
    displayDuration: number;
    emoticons: Record<MascotMode, string>;
    defaultThoughts: Record<MascotMode, string[]>;
  };
}

export type MascotMode = 
  | 'IDLE' 
  | 'SEARCHING' 
  | 'THINKING' 
  | 'ANALYZING' 
  | 'CODING' 
  | 'LISTENING' 
  | 'UPLOADING' 
  | 'SUCCESS' 
  | 'ERROR';

export const MASCOT_CONFIG: MascotConfig = {
  enabled: true,
  
  // Desktop: 100px default, 160px expanded - compact, out of the way
  desktop: {
    defaultSize: 100,
    expandedSize: 160,
  },
  
  // Mobile: 70px default, 110px expanded - smaller for mobile screens
  mobile: {
    defaultSize: 70,
    expandedSize: 110,
  },
  
  // Desktop position: top-right corner, 12px from edges
  defaultPosition: {
    x: 12,
    y: 12,
  },
  
  // Mobile position: bottom-right corner, 12px from edges
  mobileDefaultPosition: {
    x: 12,
    y: 12,
  },
  
  zIndex: 9999,
  
  storageKeys: {
    position: 'coaileague-mascot-position',
    expanded: 'coaileague-mascot-expanded',
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
    primary: '#3B82F6',
    secondary: '#8B5CF6',
    accent: '#10B981',
  },
  
  animation: {
    transitionDuration: 150,
    dragSmoothness: 16,
  },
  
  thoughts: {
    enabled: true,
    displayDuration: 3000,
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
    },
    defaultThoughts: {
      IDLE: ['Hmm?', 'Ready to help', 'What next?', 'Standing by...'],
      SEARCHING: ['Searching...', 'Looking for it...', 'Scanning...'],
      THINKING: ['Processing...', 'Let me think...', 'Analyzing...', 'Hmm, interesting...'],
      ANALYZING: ['Examining data...', 'Breaking it down...', 'Computing...'],
      CODING: ['Writing code...', 'Debugging...', 'Compiling...', 'Building...'],
      LISTENING: ['I\'m listening...', 'Tell me more...', 'Got it...'],
      UPLOADING: ['Sending...', 'Uploading...', 'Processing...'],
      SUCCESS: ['All done!', 'Perfect!', 'Success!', 'Ready!'],
      ERROR: ['Oops!', 'Something went wrong', 'Let me help...'],
    },
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

export default MASCOT_CONFIG;
