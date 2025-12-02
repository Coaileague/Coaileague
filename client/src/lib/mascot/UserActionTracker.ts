/**
 * UserActionTracker - Monitors user actions for mascot reactive animations
 * 
 * Tracks:
 * - Mouse/touch movements and clicks
 * - Keyboard typing patterns
 * - Scrolling behavior
 * - Page navigation
 * - Form interactions
 * - Loading states
 * - Tool usage
 */

import { emotesManager, type EmoteCategory } from './EmotesLibrary';

export type UserAction = 
  | 'click'
  | 'typing'
  | 'typing_fast'
  | 'typing_stop'
  | 'scroll'
  | 'scroll_fast'
  | 'scroll_stop'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'navigate'
  | 'form_start'
  | 'form_submit'
  | 'loading_start'
  | 'loading_end'
  | 'success'
  | 'error'
  | 'idle'
  | 'idle_long'
  | 'tab_visible'
  | 'tab_hidden';

export interface ActionEvent {
  action: UserAction;
  target?: HTMLElement;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface TrackerConfig {
  typingThreshold: number;
  fastTypingWPM: number;
  scrollThreshold: number;
  fastScrollSpeed: number;
  idleTimeout: number;
  longIdleTimeout: number;
  debounceMs: number;
}

const DEFAULT_CONFIG: TrackerConfig = {
  typingThreshold: 100,
  fastTypingWPM: 60,
  scrollThreshold: 50,
  fastScrollSpeed: 500,
  idleTimeout: 30000,
  longIdleTimeout: 120000,
  debounceMs: 150
};

const ACTION_EMOTE_MAP: Partial<Record<UserAction, EmoteCategory>> = {
  click: 'clicking',
  typing: 'typing',
  typing_fast: 'typing',
  scroll: 'scrolling',
  scroll_fast: 'scrolling',
  hover: 'hovering',
  focus: 'form',
  form_start: 'form',
  form_submit: 'form',
  loading_start: 'loading',
  loading_end: 'loading',
  success: 'success',
  error: 'error',
  idle: 'idle',
  idle_long: 'bored',
  navigate: 'navigation',
  tab_visible: 'greeting',
  tab_hidden: 'farewell'
};

class UserActionTracker {
  private config: TrackerConfig;
  private listeners: Set<(event: ActionEvent) => void> = new Set();
  private actionHistory: ActionEvent[] = [];
  private maxHistoryLength = 50;
  
  private typingState = {
    isTyping: false,
    lastKeyTime: 0,
    keyCount: 0,
    startTime: 0
  };
  
  private scrollState = {
    isScrolling: false,
    lastScrollTime: 0,
    lastScrollY: 0,
    scrollSpeed: 0
  };
  
  private idleState = {
    timeoutId: null as number | null,
    longTimeoutId: null as number | null,
    lastActivityTime: Date.now()
  };
  
  private loadingState = {
    isLoading: false,
    loadingCount: 0,
    startTime: 0
  };

  private typingTimeoutId: number | null = null;
  private scrollTimeoutId: number | null = null;
  private isStarted = false;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('keyup', this.handleKeyUp, true);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    document.addEventListener('mouseover', this.handleHover, { passive: true });
    document.addEventListener('focusin', this.handleFocus);
    document.addEventListener('focusout', this.handleBlur);
    document.addEventListener('submit', this.handleSubmit, true);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    this.setupIdleDetection();
    this.setupLoadingInterceptor();
    this.setupNavigationListener();
    
    this.emitAction('tab_visible');
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;

    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('mouseover', this.handleHover);
    document.removeEventListener('focusin', this.handleFocus);
    document.removeEventListener('focusout', this.handleBlur);
    document.removeEventListener('submit', this.handleSubmit, true);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.clearIdleTimers();
    
    if (this.typingTimeoutId) {
      window.clearTimeout(this.typingTimeoutId);
      this.typingTimeoutId = null;
    }
    if (this.scrollTimeoutId) {
      window.clearTimeout(this.scrollTimeoutId);
      this.scrollTimeoutId = null;
    }
  }

  private handleClick = (e: MouseEvent): void => {
    this.resetIdleTimer();
    this.emitAction('click', e.target as HTMLElement);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.resetIdleTimer();
    
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || 
                   target.tagName === 'TEXTAREA' || 
                   target.isContentEditable;
    
    if (!isInput) return;

    const now = Date.now();
    
    if (!this.typingState.isTyping) {
      this.typingState.isTyping = true;
      this.typingState.startTime = now;
      this.typingState.keyCount = 0;
      this.emitAction('typing', target);
    }

    this.typingState.keyCount++;
    this.typingState.lastKeyTime = now;

    const duration = (now - this.typingState.startTime) / 1000 / 60;
    const wpm = duration > 0 ? this.typingState.keyCount / 5 / duration : 0;
    
    if (wpm > this.config.fastTypingWPM) {
      this.emitAction('typing_fast', target, { wpm });
    }

    if (this.typingTimeoutId) {
      window.clearTimeout(this.typingTimeoutId);
    }
    
    this.typingTimeoutId = window.setTimeout(() => {
      this.typingState.isTyping = false;
      this.emitAction('typing_stop', target);
    }, this.config.typingThreshold * 3);
  };

  private handleKeyUp = (): void => {
    // Typing state managed in keydown
  };

  private handleScroll = (): void => {
    this.resetIdleTimer();
    
    const now = Date.now();
    const currentY = window.scrollY;
    const timeDelta = now - this.scrollState.lastScrollTime;
    
    if (timeDelta > 0) {
      const distance = Math.abs(currentY - this.scrollState.lastScrollY);
      this.scrollState.scrollSpeed = distance / (timeDelta / 1000);
    }
    
    this.scrollState.lastScrollY = currentY;
    this.scrollState.lastScrollTime = now;

    if (!this.scrollState.isScrolling) {
      this.scrollState.isScrolling = true;
      this.emitAction('scroll');
    }

    if (this.scrollState.scrollSpeed > this.config.fastScrollSpeed) {
      this.emitAction('scroll_fast', undefined, { speed: this.scrollState.scrollSpeed });
    }

    if (this.scrollTimeoutId) {
      window.clearTimeout(this.scrollTimeoutId);
    }
    
    this.scrollTimeoutId = window.setTimeout(() => {
      this.scrollState.isScrolling = false;
      this.scrollState.scrollSpeed = 0;
      this.emitAction('scroll_stop');
    }, 200);
  };

  private handleHover = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const isInteractive = target.tagName === 'BUTTON' || 
                         target.tagName === 'A' ||
                         target.closest('button') ||
                         target.closest('a');
    
    if (isInteractive) {
      this.emitAction('hover', target);
    }
  };

  private handleFocus = (e: FocusEvent): void => {
    const target = e.target as HTMLElement;
    const isFormField = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.tagName === 'SELECT';
    
    if (isFormField) {
      this.emitAction('focus', target);
      
      const form = target.closest('form');
      if (form && !form.dataset.mascotTracked) {
        form.dataset.mascotTracked = 'true';
        this.emitAction('form_start', target);
      }
    }
  };

  private handleBlur = (e: FocusEvent): void => {
    const target = e.target as HTMLElement;
    this.emitAction('blur', target);
  };

  private handleSubmit = (e: Event): void => {
    const target = e.target as HTMLElement;
    this.emitAction('form_submit', target);
    
    const form = target as HTMLFormElement;
    if (form) {
      form.dataset.mascotTracked = '';
    }
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.emitAction('tab_hidden');
    } else {
      this.emitAction('tab_visible');
      this.resetIdleTimer();
    }
  };

  private setupIdleDetection(): void {
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    this.idleState.lastActivityTime = Date.now();
    this.clearIdleTimers();
    
    this.idleState.timeoutId = window.setTimeout(() => {
      this.emitAction('idle');
      
      this.idleState.longTimeoutId = window.setTimeout(() => {
        this.emitAction('idle_long');
      }, this.config.longIdleTimeout - this.config.idleTimeout);
    }, this.config.idleTimeout);
  }

  private clearIdleTimers(): void {
    if (this.idleState.timeoutId) {
      window.clearTimeout(this.idleState.timeoutId);
      this.idleState.timeoutId = null;
    }
    if (this.idleState.longTimeoutId) {
      window.clearTimeout(this.idleState.longTimeoutId);
      this.idleState.longTimeoutId = null;
    }
  }

  private setupLoadingInterceptor(): void {
    const originalFetch = window.fetch;
    const self = this;
    
    window.fetch = async function(...args) {
      self.startLoading();
      try {
        const response = await originalFetch.apply(this, args);
        self.endLoading(response.ok);
        return response;
      } catch (error) {
        self.endLoading(false);
        throw error;
      }
    };

    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.send = function(...args: Parameters<typeof originalXHRSend>) {
      self.startLoading();
      
      this.addEventListener('loadend', () => {
        self.endLoading(this.status >= 200 && this.status < 400);
      });
      
      return originalXHRSend.apply(this, args);
    };
  }

  startLoading(): void {
    this.loadingState.loadingCount++;
    
    if (!this.loadingState.isLoading) {
      this.loadingState.isLoading = true;
      this.loadingState.startTime = Date.now();
      this.emitAction('loading_start');
    }
  }

  endLoading(success: boolean = true): void {
    this.loadingState.loadingCount = Math.max(0, this.loadingState.loadingCount - 1);
    
    if (this.loadingState.loadingCount === 0 && this.loadingState.isLoading) {
      this.loadingState.isLoading = false;
      const duration = Date.now() - this.loadingState.startTime;
      
      this.emitAction('loading_end', undefined, { duration, success });
      
      if (success) {
        this.emitAction('success');
      } else {
        this.emitAction('error');
      }
    }
  }

  private setupNavigationListener(): void {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const self = this;
    
    history.pushState = function(...args) {
      const result = originalPushState.apply(this, args);
      self.emitAction('navigate', undefined, { url: args[2] });
      return result;
    };
    
    history.replaceState = function(...args) {
      const result = originalReplaceState.apply(this, args);
      self.emitAction('navigate', undefined, { url: args[2] });
      return result;
    };
    
    window.addEventListener('popstate', () => {
      this.emitAction('navigate', undefined, { url: location.href });
    });
  }

  private emitAction(
    action: UserAction, 
    target?: HTMLElement, 
    data?: Record<string, unknown>
  ): void {
    const event: ActionEvent = {
      action,
      target,
      timestamp: Date.now(),
      data
    };
    
    this.actionHistory.push(event);
    if (this.actionHistory.length > this.maxHistoryLength) {
      this.actionHistory.shift();
    }
    
    this.listeners.forEach(listener => listener(event));
    
    const emoteCategory = ACTION_EMOTE_MAP[action];
    if (emoteCategory) {
      emotesManager.triggerByCategory(emoteCategory);
    }
  }

  subscribe(listener: (event: ActionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLastAction(): ActionEvent | null {
    return this.actionHistory[this.actionHistory.length - 1] || null;
  }

  getActionHistory(): ActionEvent[] {
    return [...this.actionHistory];
  }

  getRecentActions(count: number): ActionEvent[] {
    return this.actionHistory.slice(-count);
  }

  isUserIdle(): boolean {
    return Date.now() - this.idleState.lastActivityTime > this.config.idleTimeout;
  }

  isUserTyping(): boolean {
    return this.typingState.isTyping;
  }

  isUserScrolling(): boolean {
    return this.scrollState.isScrolling;
  }

  isLoading(): boolean {
    return this.loadingState.isLoading;
  }

  getIdleDuration(): number {
    return Date.now() - this.idleState.lastActivityTime;
  }
}

export const userActionTracker = new UserActionTracker();
export default userActionTracker;
