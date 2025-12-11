/**
 * EmotesLibrary - Comprehensive emotes and expressions for Trinity AI Mascot
 * 
 * 50+ unique emotes covering all user interaction scenarios:
 * - Loading/waiting states
 * - User actions (clicking, typing, scrolling)
 * - System events (success, error, notifications)
 * - Contextual reactions (forms, navigation, tools)
 * - Idle behaviors and personality expressions
 */

export type EmoteCategory = 
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'typing'
  | 'scrolling'
  | 'clicking'
  | 'hovering'
  | 'form'
  | 'navigation'
  | 'tool'
  | 'greeting'
  | 'farewell'
  | 'confused'
  | 'excited'
  | 'bored'
  | 'tired'
  | 'curious'
  | 'proud'
  | 'shy'
  | 'playful'
  | 'helpful'
  | 'celebration';

export interface Emote {
  id: string;
  category: EmoteCategory;
  expression: string;
  animation: EmoteAnimation;
  sound?: string;
  duration: number;
  priority: number;
}

export type EmoteAnimation = 
  | 'bounce'
  | 'wiggle'
  | 'spin'
  | 'pulse'
  | 'shake'
  | 'float'
  | 'jump'
  | 'nod'
  | 'wave'
  | 'blink'
  | 'sparkle'
  | 'glow'
  | 'shrink'
  | 'grow'
  | 'dizzy'
  | 'sleepy'
  | 'alert'
  | 'peek'
  | 'hide'
  | 'dance'
  | 'explode'
  | 'melt'
  | 'freeze'
  | 'rainbow';

export interface EmoteState {
  currentEmote: Emote | null;
  queue: Emote[];
  lastEmoteTime: number;
  cooldownMs: number;
}

export const EMOTE_ANIMATIONS: Record<EmoteAnimation, {
  keyframes: string;
  duration: number;
  easing: string;
  iterations: number;
}> = {
  bounce: {
    keyframes: `
      0%, 100% { transform: translateY(0) scale(1); }
      25% { transform: translateY(-8px) scale(1.05); }
      50% { transform: translateY(-12px) scale(1.1); }
      75% { transform: translateY(-4px) scale(1.02); }
    `,
    duration: 600,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    iterations: 2
  },
  wiggle: {
    keyframes: `
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-5deg); }
      75% { transform: rotate(5deg); }
    `,
    duration: 300,
    easing: 'ease-in-out',
    iterations: 3
  },
  spin: {
    keyframes: `
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    `,
    duration: 800,
    easing: 'linear',
    iterations: 1
  },
  pulse: {
    keyframes: `
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.8; }
    `,
    duration: 500,
    easing: 'ease-in-out',
    iterations: 2
  },
  shake: {
    keyframes: `
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-4px); }
      40% { transform: translateX(4px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    `,
    duration: 400,
    easing: 'ease-in-out',
    iterations: 2
  },
  float: {
    keyframes: `
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    `,
    duration: 2000,
    easing: 'ease-in-out',
    iterations: -1
  },
  jump: {
    keyframes: `
      0% { transform: translateY(0) scaleY(1); }
      15% { transform: translateY(0) scaleY(0.8) scaleX(1.1); }
      30% { transform: translateY(-20px) scaleY(1.1) scaleX(0.95); }
      50% { transform: translateY(-25px) scaleY(1); }
      70% { transform: translateY(-10px) scaleY(1); }
      85% { transform: translateY(0) scaleY(0.9) scaleX(1.05); }
      100% { transform: translateY(0) scaleY(1); }
    `,
    duration: 700,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    iterations: 1
  },
  nod: {
    keyframes: `
      0%, 100% { transform: translateY(0); }
      30% { transform: translateY(4px); }
      60% { transform: translateY(2px); }
    `,
    duration: 400,
    easing: 'ease-out',
    iterations: 2
  },
  wave: {
    keyframes: `
      0%, 100% { transform: rotate(0deg) translateX(0); }
      25% { transform: rotate(15deg) translateX(3px); }
      75% { transform: rotate(-10deg) translateX(-2px); }
    `,
    duration: 500,
    easing: 'ease-in-out',
    iterations: 3
  },
  blink: {
    keyframes: `
      0%, 45%, 55%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(0.1); }
    `,
    duration: 200,
    easing: 'ease-in-out',
    iterations: 2
  },
  sparkle: {
    keyframes: `
      0%, 100% { filter: brightness(1) drop-shadow(0 0 2px currentColor); }
      50% { filter: brightness(1.4) drop-shadow(0 0 8px currentColor); }
    `,
    duration: 400,
    easing: 'ease-in-out',
    iterations: 3
  },
  glow: {
    keyframes: `
      0%, 100% { filter: drop-shadow(0 0 4px currentColor); }
      50% { filter: drop-shadow(0 0 12px currentColor) drop-shadow(0 0 20px currentColor); }
    `,
    duration: 1000,
    easing: 'ease-in-out',
    iterations: 2
  },
  shrink: {
    keyframes: `
      0% { transform: scale(1); }
      50% { transform: scale(0.7); }
      100% { transform: scale(1); }
    `,
    duration: 500,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    iterations: 1
  },
  grow: {
    keyframes: `
      0% { transform: scale(1); }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); }
    `,
    duration: 600,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    iterations: 1
  },
  dizzy: {
    keyframes: `
      0% { transform: rotate(0deg) translateX(0); }
      25% { transform: rotate(8deg) translateX(3px); }
      50% { transform: rotate(-8deg) translateX(-3px); }
      75% { transform: rotate(5deg) translateX(2px); }
      100% { transform: rotate(0deg) translateX(0); }
    `,
    duration: 600,
    easing: 'ease-in-out',
    iterations: 2
  },
  sleepy: {
    keyframes: `
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25% { transform: translateY(2px) rotate(-3deg); }
      50% { transform: translateY(4px) rotate(0deg); opacity: 0.7; }
      75% { transform: translateY(2px) rotate(3deg); }
    `,
    duration: 2000,
    easing: 'ease-in-out',
    iterations: -1
  },
  alert: {
    keyframes: `
      0%, 100% { transform: scale(1) translateY(0); }
      10% { transform: scale(1.2) translateY(-5px); }
      20% { transform: scale(1) translateY(0); }
    `,
    duration: 300,
    easing: 'ease-out',
    iterations: 2
  },
  peek: {
    keyframes: `
      0%, 100% { transform: translateX(0) scale(1); opacity: 1; }
      30% { transform: translateX(-10px) scale(0.9); opacity: 0.6; }
      60% { transform: translateX(5px) scale(1.05); opacity: 1; }
    `,
    duration: 800,
    easing: 'ease-in-out',
    iterations: 1
  },
  hide: {
    keyframes: `
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(0.5); opacity: 0.3; }
      100% { transform: scale(0.8); opacity: 0.6; }
    `,
    duration: 400,
    easing: 'ease-out',
    iterations: 1
  },
  dance: {
    keyframes: `
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25% { transform: translateY(-5px) rotate(-5deg); }
      50% { transform: translateY(0) rotate(5deg); }
      75% { transform: translateY(-3px) rotate(-3deg); }
    `,
    duration: 400,
    easing: 'ease-in-out',
    iterations: 4
  },
  explode: {
    keyframes: `
      0% { transform: scale(1); filter: brightness(1); }
      30% { transform: scale(1.5); filter: brightness(2); }
      100% { transform: scale(1); filter: brightness(1); }
    `,
    duration: 500,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    iterations: 1
  },
  melt: {
    keyframes: `
      0%, 100% { transform: scaleY(1) translateY(0); }
      50% { transform: scaleY(0.8) translateY(5px); }
    `,
    duration: 1000,
    easing: 'ease-in-out',
    iterations: 1
  },
  freeze: {
    keyframes: `
      0%, 100% { transform: scale(1); filter: hue-rotate(0deg) brightness(1); }
      50% { transform: scale(0.95); filter: hue-rotate(180deg) brightness(1.2); }
    `,
    duration: 800,
    easing: 'ease-in-out',
    iterations: 1
  },
  rainbow: {
    keyframes: `
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    `,
    duration: 2000,
    easing: 'linear',
    iterations: 1
  }
};

export const EMOTES: Emote[] = [
  { id: 'idle-ready', category: 'idle', expression: 'Ready to help!', animation: 'float', duration: 3000, priority: 1 },
  { id: 'idle-thinking', category: 'idle', expression: 'Hmm...', animation: 'pulse', duration: 2000, priority: 1 },
  { id: 'idle-watching', category: 'idle', expression: 'Observing...', animation: 'blink', duration: 1500, priority: 1 },
  { id: 'idle-patient', category: 'idle', expression: 'Take your time!', animation: 'nod', duration: 2000, priority: 1 },
  
  { id: 'loading-wait', category: 'loading', expression: 'Working on it...', animation: 'spin', duration: 1500, priority: 8 },
  { id: 'loading-process', category: 'loading', expression: 'Processing...', animation: 'pulse', duration: 2000, priority: 8 },
  { id: 'loading-almost', category: 'loading', expression: 'Almost there!', animation: 'bounce', duration: 1000, priority: 8 },
  { id: 'loading-patient', category: 'loading', expression: 'Good things take time', animation: 'wiggle', duration: 2000, priority: 7 },
  
  { id: 'success-done', category: 'success', expression: 'Done!', animation: 'explode', duration: 800, priority: 10 },
  { id: 'success-great', category: 'success', expression: 'Perfect!', animation: 'jump', duration: 900, priority: 10 },
  { id: 'success-celebrate', category: 'success', expression: 'Woohoo!', animation: 'dance', duration: 1600, priority: 10 },
  { id: 'success-proud', category: 'success', expression: 'Nailed it!', animation: 'sparkle', duration: 1200, priority: 10 },
  
  { id: 'error-oops', category: 'error', expression: 'Oops!', animation: 'shake', duration: 800, priority: 10 },
  { id: 'error-hmm', category: 'error', expression: 'That didnt work...', animation: 'shrink', duration: 1000, priority: 10 },
  { id: 'error-retry', category: 'error', expression: 'Try again?', animation: 'nod', duration: 800, priority: 9 },
  { id: 'error-sorry', category: 'error', expression: 'My bad!', animation: 'hide', duration: 800, priority: 9 },
  
  { id: 'typing-listen', category: 'typing', expression: 'Type away!', animation: 'pulse', duration: 2000, priority: 5 },
  { id: 'typing-focus', category: 'typing', expression: 'Focus mode!', animation: 'glow', duration: 2500, priority: 5 },
  { id: 'typing-fast', category: 'typing', expression: 'Speedy!', animation: 'sparkle', duration: 1000, priority: 6 },
  
  { id: 'scroll-wheee', category: 'scrolling', expression: 'Wheee!', animation: 'bounce', duration: 600, priority: 4 },
  { id: 'scroll-explore', category: 'scrolling', expression: 'Exploring!', animation: 'peek', duration: 1000, priority: 4 },
  { id: 'scroll-fast', category: 'scrolling', expression: 'Slow down!', animation: 'dizzy', duration: 1200, priority: 5 },
  
  { id: 'click-tap', category: 'clicking', expression: 'Click!', animation: 'bounce', duration: 400, priority: 6 },
  { id: 'click-nice', category: 'clicking', expression: 'Nice choice!', animation: 'nod', duration: 600, priority: 6 },
  { id: 'click-go', category: 'clicking', expression: 'Here we go!', animation: 'jump', duration: 700, priority: 6 },
  
  { id: 'hover-curious', category: 'hovering', expression: 'Whats this?', animation: 'peek', duration: 800, priority: 3 },
  { id: 'hover-look', category: 'hovering', expression: 'Interesting...', animation: 'glow', duration: 1000, priority: 3 },
  
  { id: 'form-help', category: 'form', expression: 'I can help!', animation: 'wave', duration: 1000, priority: 7 },
  { id: 'form-fill', category: 'form', expression: 'Fill it in!', animation: 'nod', duration: 800, priority: 7 },
  { id: 'form-almost', category: 'form', expression: 'Almost done!', animation: 'bounce', duration: 600, priority: 7 },
  { id: 'form-submit', category: 'form', expression: 'Send it!', animation: 'sparkle', duration: 800, priority: 8 },
  
  { id: 'nav-here', category: 'navigation', expression: 'This way!', animation: 'wave', duration: 800, priority: 6 },
  { id: 'nav-new', category: 'navigation', expression: 'New page!', animation: 'jump', duration: 700, priority: 6 },
  { id: 'nav-back', category: 'navigation', expression: 'Going back!', animation: 'spin', duration: 600, priority: 6 },
  
  { id: 'tool-use', category: 'tool', expression: 'Tool time!', animation: 'glow', duration: 1000, priority: 7 },
  { id: 'tool-work', category: 'tool', expression: 'On it!', animation: 'spin', duration: 1200, priority: 7 },
  
  { id: 'greet-hi', category: 'greeting', expression: 'Hey there!', animation: 'wave', duration: 1200, priority: 9 },
  { id: 'greet-welcome', category: 'greeting', expression: 'Welcome back!', animation: 'bounce', duration: 1000, priority: 9 },
  { id: 'greet-morning', category: 'greeting', expression: 'Good morning!', animation: 'sparkle', duration: 1200, priority: 9 },
  { id: 'greet-evening', category: 'greeting', expression: 'Good evening!', animation: 'glow', duration: 1200, priority: 9 },
  
  { id: 'bye-later', category: 'farewell', expression: 'See you later!', animation: 'wave', duration: 1200, priority: 9 },
  { id: 'bye-miss', category: 'farewell', expression: 'Ill miss you!', animation: 'shrink', duration: 1000, priority: 9 },
  
  { id: 'confused-huh', category: 'confused', expression: 'Huh?', animation: 'dizzy', duration: 1200, priority: 5 },
  { id: 'confused-lost', category: 'confused', expression: 'Im confused!', animation: 'shake', duration: 800, priority: 5 },
  
  { id: 'excited-yay', category: 'excited', expression: 'Yay!', animation: 'jump', duration: 700, priority: 8 },
  { id: 'excited-wow', category: 'excited', expression: 'Wow!', animation: 'explode', duration: 600, priority: 8 },
  { id: 'excited-amazing', category: 'excited', expression: 'Amazing!', animation: 'rainbow', duration: 2000, priority: 8 },
  
  { id: 'bored-yawn', category: 'bored', expression: '*yawns*', animation: 'sleepy', duration: 3000, priority: 2 },
  { id: 'bored-wait', category: 'bored', expression: 'So quiet...', animation: 'melt', duration: 2000, priority: 2 },
  
  { id: 'tired-zzz', category: 'tired', expression: 'Zzz...', animation: 'sleepy', duration: 4000, priority: 1 },
  { id: 'tired-rest', category: 'tired', expression: 'Need a break...', animation: 'melt', duration: 2500, priority: 1 },
  
  { id: 'curious-peek', category: 'curious', expression: 'Whats that?', animation: 'peek', duration: 1000, priority: 4 },
  { id: 'curious-look', category: 'curious', expression: 'Hmm, interesting!', animation: 'glow', duration: 1500, priority: 4 },
  
  { id: 'proud-great', category: 'proud', expression: 'Great job!', animation: 'sparkle', duration: 1200, priority: 7 },
  { id: 'proud-star', category: 'proud', expression: 'You star!', animation: 'rainbow', duration: 2000, priority: 7 },
  
  { id: 'shy-blush', category: 'shy', expression: '*blushes*', animation: 'shrink', duration: 800, priority: 3 },
  { id: 'shy-hide', category: 'shy', expression: 'Eep!', animation: 'hide', duration: 600, priority: 3 },
  
  { id: 'playful-catch', category: 'playful', expression: 'Catch me!', animation: 'dance', duration: 1600, priority: 4 },
  { id: 'playful-fun', category: 'playful', expression: 'This is fun!', animation: 'bounce', duration: 1200, priority: 4 },
  
  { id: 'helpful-tip', category: 'helpful', expression: 'Pro tip!', animation: 'glow', duration: 1500, priority: 6 },
  { id: 'helpful-idea', category: 'helpful', expression: 'I have an idea!', animation: 'sparkle', duration: 1200, priority: 6 },
  
  { id: 'celebrate-party', category: 'celebration', expression: 'Party time!', animation: 'dance', duration: 2000, priority: 10 },
  { id: 'celebrate-confetti', category: 'celebration', expression: 'Woohoo!', animation: 'explode', duration: 800, priority: 10 },
];

class EmotesManager {
  private state: EmoteState = {
    currentEmote: null,
    queue: [],
    lastEmoteTime: 0,
    cooldownMs: 500
  };
  
  private listeners: Set<(emote: Emote | null) => void> = new Set();
  private timeoutId: number | null = null;

  getEmotesByCategory(category: EmoteCategory): Emote[] {
    return EMOTES.filter(e => e.category === category);
  }

  getRandomEmote(category: EmoteCategory): Emote | null {
    const emotes = this.getEmotesByCategory(category);
    if (emotes.length === 0) return null;
    return emotes[Math.floor(Math.random() * emotes.length)];
  }

  triggerEmote(emote: Emote, force = false): void {
    const now = Date.now();
    
    if (!force && (now - this.state.lastEmoteTime) < this.state.cooldownMs) {
      if (emote.priority > (this.state.currentEmote?.priority || 0)) {
        this.state.queue.unshift(emote);
      } else {
        this.state.queue.push(emote);
      }
      return;
    }

    this.state.currentEmote = emote;
    this.state.lastEmoteTime = now;
    this.notifyListeners(emote);

    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(() => {
      this.state.currentEmote = null;
      this.notifyListeners(null);
      
      if (this.state.queue.length > 0) {
        const nextEmote = this.state.queue.shift()!;
        this.triggerEmote(nextEmote, true);
      }
    }, emote.duration);
  }

  triggerByCategory(category: EmoteCategory): void {
    const emote = this.getRandomEmote(category);
    if (emote) {
      this.triggerEmote(emote);
    }
  }

  triggerById(id: string): void {
    const emote = EMOTES.find(e => e.id === id);
    if (emote) {
      this.triggerEmote(emote);
    }
  }

  getCurrentEmote(): Emote | null {
    return this.state.currentEmote;
  }

  getAnimation(animation: EmoteAnimation) {
    return EMOTE_ANIMATIONS[animation];
  }

  subscribe(listener: (emote: Emote | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(emote: Emote | null): void {
    this.listeners.forEach(listener => listener(emote));
  }

  clearQueue(): void {
    this.state.queue = [];
  }

  reset(): void {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.state = {
      currentEmote: null,
      queue: [],
      lastEmoteTime: 0,
      cooldownMs: 500
    };
    this.notifyListeners(null);
  }
}

export const emotesManager = new EmotesManager();
export default emotesManager;
