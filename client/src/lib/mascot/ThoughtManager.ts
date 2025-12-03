/**
 * ThoughtManager - Manages mascot thoughts, reactions, and AI-driven insights
 * 
 * This module handles:
 * - Random thought rotation based on mascot mode
 * - Contextual reactions to user interactions
 * - Holiday-aware messages
 * - AI-generated insights and advice
 * - Task suggestions
 */

import { 
  MASCOT_CONFIG, 
  MascotMode, 
  getCurrentHoliday, 
  getRandomThought,
  getRandomReaction,
  getEmoticon,
  isPublicPage,
  getRandomPromoThought,
  PUBLIC_PAGE_PROMO_CONFIG,
  type HolidayConfig,
  type InteractionType,
  type PromoThought 
} from '@/config/mascotConfig';

export interface Thought {
  id: string;
  text: string;
  emoticon: string;
  mode: MascotMode;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: 'default' | 'reaction' | 'holiday' | 'ai' | 'task' | 'promo';
  expiresAt: number;
  // Promotional thought extras
  ctaText?: string;          // Call-to-action button text
  ctaLink?: string;          // Navigation link for CTA
  showDiscount?: boolean;    // Show 10% discount badge
}

export interface ThoughtManagerState {
  currentThought: Thought | null;
  queue: Thought[];
  history: Thought[];
  isHoliday: boolean;
  currentHoliday: HolidayConfig | null;
  lastInteraction: InteractionType | null;
  dragVelocity: number;
  // Public page tracking
  currentPath: string;
  isOnPublicPage: boolean;
  promoRotationTimer: ReturnType<typeof setInterval> | null;
}

type ThoughtListener = (thought: Thought | null) => void;

class ThoughtManager {
  private state: ThoughtManagerState;
  private listeners: Set<ThoughtListener> = new Set();
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  
  constructor() {
    const holiday = getCurrentHoliday();
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
    this.state = {
      currentThought: null,
      queue: [],
      history: [],
      isHoliday: holiday !== null,
      currentHoliday: holiday,
      lastInteraction: null,
      dragVelocity: 0,
      currentPath,
      isOnPublicPage: isPublicPage(currentPath),
      promoRotationTimer: null,
    };
  }
  
  subscribe(listener: ThoughtListener): () => void {
    this.listeners.add(listener);
    listener(this.state.currentThought);
    return () => this.listeners.delete(listener);
  }
  
  private notify(): void {
    this.listeners.forEach(listener => listener(this.state.currentThought));
  }
  
  private createThought(
    text: string,
    mode: MascotMode,
    source: Thought['source'] = 'default',
    priority: Thought['priority'] = 'normal'
  ): Thought {
    return {
      id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      emoticon: getEmoticon(mode),
      mode,
      priority,
      source,
      expiresAt: Date.now() + MASCOT_CONFIG.thoughts.displayDuration,
    };
  }
  
  showThought(thought: Thought): void {
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
    }
    
    this.state.currentThought = thought;
    this.state.history.push(thought);
    if (this.state.history.length > 50) {
      this.state.history.shift();
    }
    
    this.notify();
    
    this.displayTimer = setTimeout(() => {
      this.clearThought();
    }, MASCOT_CONFIG.thoughts.displayDuration);
  }
  
  clearThought(): void {
    this.state.currentThought = null;
    this.notify();
    
    if (this.state.queue.length > 0) {
      const next = this.state.queue.shift()!;
      setTimeout(() => this.showThought(next), 500);
    }
  }
  
  queueThought(thought: Thought): void {
    if (thought.priority === 'urgent') {
      this.showThought(thought);
    } else if (thought.priority === 'high') {
      this.state.queue.unshift(thought);
      if (!this.state.currentThought) {
        this.showThought(this.state.queue.shift()!);
      }
    } else {
      this.state.queue.push(thought);
      if (!this.state.currentThought) {
        this.showThought(this.state.queue.shift()!);
      }
    }
  }
  
  triggerModeThought(mode: MascotMode): void {
    const text = getRandomThought(mode);
    if (text) {
      const thought = this.createThought(text, mode, 'default', 'normal');
      this.queueThought(thought);
    }
  }
  
  triggerReaction(interactionType: InteractionType, velocity?: number): void {
    this.state.lastInteraction = interactionType;
    
    if (velocity !== undefined) {
      this.state.dragVelocity = velocity;
    }
    
    let text: string;
    let mode: MascotMode = 'IDLE';
    
    switch (interactionType) {
      case 'tap':
        text = getRandomReaction('tap', 'single');
        break;
      case 'double_tap':
        text = getRandomReaction('tap', 'double');
        break;
      case 'long_press':
        text = getRandomReaction('tap', 'longPress');
        break;
      case 'drag_start':
        text = getRandomReaction('drag', 'start');
        break;
      case 'drag_move':
        if (velocity && velocity > 15) {
          text = getRandomReaction('movement', 'veryFast');
        } else if (velocity && velocity > 8) {
          text = getRandomReaction('movement', 'fast');
        } else {
          text = getRandomReaction('movement', 'slow');
        }
        break;
      case 'drag_end':
        if (this.state.dragVelocity > 10) {
          text = getRandomReaction('movement', 'stop');
        } else {
          text = getRandomReaction('drag', 'end');
        }
        this.state.dragVelocity = 0;
        break;
      case 'idle_timeout':
        const idleTime = Date.now() - (this.state.history[this.state.history.length - 1]?.expiresAt || Date.now());
        if (idleTime > 60000) {
          text = getRandomReaction('idle', 'long');
        } else if (idleTime > 30000) {
          text = getRandomReaction('idle', 'medium');
        } else {
          text = getRandomReaction('idle', 'short');
        }
        break;
      default:
        return;
    }
    
    const thought = this.createThought(text, mode, 'reaction', 'high');
    this.showThought(thought);
  }
  
  triggerHolidayGreeting(): void {
    if (this.state.currentHoliday) {
      const thought = this.createThought(
        this.state.currentHoliday.greeting,
        'HOLIDAY',
        'holiday',
        'high'
      );
      this.queueThought(thought);
    }
  }
  
  triggerAIInsight(text: string, priority: Thought['priority'] = 'normal'): void {
    const thought = this.createThought(text, 'ADVISING', 'ai', priority);
    this.queueThought(thought);
  }
  
  triggerUpdateAnnouncement(): void {
    const announcements = MASCOT_CONFIG.ai.updateAnnouncements;
    const text = announcements[Math.floor(Math.random() * announcements.length)];
    const thought = this.createThought(text, 'THINKING', 'ai', 'high');
    this.showThought(thought);
  }
  
  triggerTaskSuggestion(taskTitle: string): void {
    const thought = this.createThought(
      `New task idea: ${taskTitle}`,
      'ADVISING',
      'task',
      'normal'
    );
    this.queueThought(thought);
  }
  
  // ============================================================================
  // PUBLIC PAGE PROMOTIONAL THOUGHTS
  // ============================================================================
  
  /**
   * Update the current page path and trigger promo mode if on public page
   */
  setCurrentPath(path: string): void {
    this.state.currentPath = path;
    const wasOnPublicPage = this.state.isOnPublicPage;
    this.state.isOnPublicPage = isPublicPage(path);
    
    // Transition to/from public page promo mode
    if (this.state.isOnPublicPage && !wasOnPublicPage) {
      this.startPromoRotation();
      // Show welcome promo on entering public page
      this.triggerPromoThought();
    } else if (!this.state.isOnPublicPage && wasOnPublicPage) {
      this.stopPromoRotation();
    }
  }
  
  /**
   * Trigger a promotional thought for the current public page
   */
  triggerPromoThought(): void {
    if (!this.state.isOnPublicPage || !PUBLIC_PAGE_PROMO_CONFIG.enabled) return;
    
    const promo = getRandomPromoThought(this.state.currentPath);
    if (!promo) return;
    
    // Create promo thought with CTA extras
    const thought: Thought = {
      id: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: promo.text,
      emoticon: promo.emote ? this.getEmoteEmoticon(promo.emote) : '✨',
      mode: 'ADVISING',
      priority: promo.priority,
      source: 'promo',
      expiresAt: Date.now() + MASCOT_CONFIG.thoughts.displayDuration,
      ctaText: promo.ctaText,
      ctaLink: promo.ctaLink,
      showDiscount: promo.showDiscount,
    };
    
    this.queueThought(thought);
  }
  
  /**
   * Get emoticon for emote type
   */
  private getEmoteEmoticon(emote: string): string {
    const emoteIcons: Record<string, string> = {
      waving: '👋',
      helpful: '💡',
      curious: '🤔',
      excited: '🎉',
      nodding: '✅',
      proud: '⭐',
      happy: '😊',
    };
    return emoteIcons[emote] || '✨';
  }
  
  /**
   * Start promotional thought rotation (on public pages)
   */
  startPromoRotation(): void {
    if (this.state.promoRotationTimer) return;
    
    this.state.promoRotationTimer = setInterval(() => {
      if (this.state.isOnPublicPage && !this.state.currentThought && this.state.queue.length === 0) {
        // On public pages, alternate between promo thoughts and regular ones
        if (Math.random() > 0.3) { // 70% chance for promo
          this.triggerPromoThought();
        } else if (this.state.isHoliday && this.state.currentHoliday) {
          const thoughts = this.state.currentHoliday.thoughts;
          const text = thoughts[Math.floor(Math.random() * thoughts.length)];
          const thought = this.createThought(text, 'HOLIDAY', 'holiday', 'low');
          this.queueThought(thought);
        } else {
          this.triggerModeThought('IDLE');
        }
      }
    }, PUBLIC_PAGE_PROMO_CONFIG.rotateInterval);
  }
  
  /**
   * Stop promotional thought rotation
   */
  stopPromoRotation(): void {
    if (this.state.promoRotationTimer) {
      clearInterval(this.state.promoRotationTimer);
      this.state.promoRotationTimer = null;
    }
  }
  
  /**
   * Check if currently on a public page
   */
  isOnPublicPage(): boolean {
    return this.state.isOnPublicPage;
  }
  
  startRotation(): void {
    if (this.rotationTimer) return;
    
    if (this.state.isHoliday) {
      this.triggerHolidayGreeting();
    }
    
    this.rotationTimer = setInterval(() => {
      if (!this.state.currentThought && this.state.queue.length === 0) {
        if (this.state.isHoliday && this.state.currentHoliday && Math.random() > 0.7) {
          const thoughts = this.state.currentHoliday.thoughts;
          const text = thoughts[Math.floor(Math.random() * thoughts.length)];
          const thought = this.createThought(text, 'HOLIDAY', 'holiday', 'low');
          this.queueThought(thought);
        } else {
          this.triggerModeThought('IDLE');
        }
      }
    }, MASCOT_CONFIG.thoughts.rotateInterval);
  }
  
  stopRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }
  
  getState(): ThoughtManagerState {
    return { ...this.state };
  }
  
  checkHoliday(): void {
    const holiday = getCurrentHoliday();
    const wasHoliday = this.state.isHoliday;
    
    this.state.currentHoliday = holiday;
    this.state.isHoliday = holiday !== null;
    
    if (!wasHoliday && this.state.isHoliday) {
      this.triggerHolidayGreeting();
    }
  }
}

export const thoughtManager = new ThoughtManager();
export default thoughtManager;
