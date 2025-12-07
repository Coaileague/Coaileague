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
  getActionText,
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
  source: 'default' | 'reaction' | 'holiday' | 'ai' | 'task' | 'promo' | 'action' | 'upgrade_nudge' | 'upgrade_hint';
  expiresAt: number;
  // Promotional thought extras
  ctaText?: string;          // Call-to-action button text
  ctaLink?: string;          // Navigation link for CTA
  showDiscount?: boolean;    // Show 10% discount badge
  // Action state extras - for animated ellipsis display
  isActionState?: boolean;   // True for action indicators like "thinking..." "coding..."
}

// User info for personalized greetings
export interface UserInfo {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

// Credit status for Business Buddy awareness
export interface CreditStatus {
  currentBalance: number;
  monthlyAllocation: number;
  usedThisMonth: number;
  percentUsed: number;
  isLow: boolean;      // Below 20%
  isCritical: boolean; // Below 5%
  tier: string;
}

// Trinity context for role-aware persona selection
export interface TrinityPersonaContext {
  platformRole: string;
  isPlatformStaff: boolean;
  isRootAdmin: boolean;
  isSupportRole: boolean;
  workspaceRole?: string;
  isOrgOwner: boolean;
  isManager: boolean;
  subscriptionTier: 'free' | 'starter' | 'professional' | 'enterprise';
  hasTrinityPro: boolean;
  hasBusinessBuddy: boolean;
  orgStats?: {
    employeeCount: number;
    departmentCount: number;
    isNewOrg: boolean;
  };
  persona: 'executive_advisor' | 'support_partner' | 'business_buddy' | 'onboarding_guide' | 'standard';
  greeting?: string;
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
  // User tracking for personalized greetings
  user: UserInfo | null;
  lastGreetedUserId: string | null;
  // Onboarding tracking for persistent reminders
  onboardingProgress: { completed: number; total: number } | null;
  isOnboardingComplete: boolean;
  advisorMode: boolean;
  // Credit awareness for Business Buddy
  creditStatus: CreditStatus | null;
  lastCreditWarningAt: number | null;
  // Trinity role-aware persona context
  trinityContext: TrinityPersonaContext | null;
}

type ThoughtListener = (thought: Thought | null) => void;

class ThoughtManager {
  private state: ThoughtManagerState;
  private listeners: Set<ThoughtListener> = new Set();
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  
  private onboardingReminderTimer: ReturnType<typeof setInterval> | null = null;
  private initialReminderTimeout: ReturnType<typeof setTimeout> | null = null;
  
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
      user: null,
      lastGreetedUserId: null,
      onboardingProgress: null,
      isOnboardingComplete: false,
      advisorMode: false,
      creditStatus: null,
      lastCreditWarningAt: null,
      trinityContext: null,
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
  
  showSimpleThought(options: {
    text: string;
    priority?: Thought['priority'];
    source?: Thought['source'];
    duration?: number;
    mode?: MascotMode;
  }): void {
    const mode = options.mode || 'IDLE';
    const thought = this.createThought(
      options.text,
      mode,
      options.source || 'default',
      options.priority || 'low'
    );
    
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
    }
    
    this.state.currentThought = thought;
    this.state.history.push(thought);
    if (this.state.history.length > 50) {
      this.state.history.shift();
    }
    
    this.notify();
    
    const displayDuration = options.duration || MASCOT_CONFIG.thoughts.displayDuration;
    this.displayTimer = setTimeout(() => {
      this.clearThought();
    }, displayDuration);
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
  
  /**
   * Trigger an action state indicator like "thinking..." "coding..." "automating..."
   * Shows dynamic activity with animated ellipsis in the thought bubble.
   * Action states are high priority and replace existing action states.
   */
  triggerActionState(mode: MascotMode, customText?: string): void {
    // Get appropriate action text with seasonal override
    const holidayKey = this.state.currentHoliday?.key || null;
    const actionText = customText || getActionText(mode, holidayKey);
    
    // If already showing same action state, just refresh expiry
    if (
      this.state.currentThought?.source === 'action' &&
      this.state.currentThought?.mode === mode &&
      this.state.currentThought?.text === actionText
    ) {
      // Extend the expiry time
      this.state.currentThought.expiresAt = Date.now() + MASCOT_CONFIG.thoughts.displayDuration;
      return;
    }
    
    // Create action state thought with special flag for ellipsis animation
    const actionThought: Thought = {
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: actionText,
      emoticon: getEmoticon(mode),
      mode,
      priority: 'high',
      source: 'action',
      expiresAt: Date.now() + MASCOT_CONFIG.thoughts.displayDuration,
      isActionState: true, // Flag for MagicFloatingText to animate ellipsis
    };
    
    // Show immediately, replacing any existing thought
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
    }
    
    this.state.currentThought = actionThought;
    this.state.history.push(actionThought);
    if (this.state.history.length > 50) {
      this.state.history.shift();
    }
    
    this.notify();
    
    // Set timer to clear after display duration
    this.displayTimer = setTimeout(() => {
      this.clearThought();
    }, MASCOT_CONFIG.thoughts.displayDuration);
  }
  
  /**
   * Stop showing action state indicator and clear the thought
   */
  stopActionState(): void {
    if (this.state.currentThought?.source === 'action') {
      if (this.displayTimer) {
        clearTimeout(this.displayTimer);
        this.displayTimer = null;
      }
      this.state.currentThought = null;
      this.notify();
    }
  }
  
  /**
   * Check if currently showing an action state
   */
  isShowingActionState(): boolean {
    return this.state.currentThought?.source === 'action';
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
  
  // ============================================================================
  // PERSONALIZED USER GREETINGS
  // ============================================================================
  
  /**
   * Set the current user and trigger personalized greeting
   */
  setUser(user: UserInfo | null): void {
    const previousUserId = this.state.user?.id;
    this.state.user = user;
    
    // Clean up onboarding reminders when user logs out
    if (!user) {
      this.stopPersistentReminders();
      this.state.onboardingProgress = null;
      this.state.isOnboardingComplete = false;
      this.state.advisorMode = false;
      return;
    }
    
    // Reset onboarding state when switching users
    if (previousUserId && user.id !== previousUserId) {
      this.stopPersistentReminders();
      this.state.onboardingProgress = null;
      this.state.isOnboardingComplete = false;
      this.state.advisorMode = false;
    }
    
    // Trigger personalized greeting when:
    // 1. User logs in for the first time this session
    // 2. User switches to a different account (hasn't been greeted yet)
    if (user && user.id !== this.state.lastGreetedUserId) {
      const userId = user.id;
      setTimeout(() => {
        // Verify user is still the same at trigger time to prevent stale greetings
        if (this.state.user?.id === userId && this.state.lastGreetedUserId !== userId) {
          this.state.lastGreetedUserId = userId;
          // Use role-aware greeting if context is available, otherwise use standard
          if (this.state.trinityContext) {
            this.triggerRoleAwareGreeting();
          } else {
            this.triggerPersonalizedGreeting();
          }
        }
      }, 1500);
    }
  }
  
  /**
   * Get user's display name (first name or email prefix)
   */
  private getUserDisplayName(): string {
    if (!this.state.user) return 'there';
    
    if (this.state.user.firstName) {
      return this.state.user.firstName;
    }
    
    if (this.state.user.email) {
      return this.state.user.email.split('@')[0];
    }
    
    return 'there';
  }
  
  /**
   * Trigger a personalized greeting for the logged-in user
   */
  triggerPersonalizedGreeting(): void {
    if (!this.state.user) return;
    
    const displayName = this.getUserDisplayName();
    const hour = new Date().getHours();
    
    // Time-based greeting
    let timeGreeting: string;
    if (hour >= 5 && hour < 12) {
      timeGreeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeGreeting = 'Good evening';
    } else {
      timeGreeting = 'Working late';
    }
    
    // Personalized greetings with name
    const greetings = [
      `${timeGreeting}, ${displayName}! Ready to get things done?`,
      `Hey ${displayName}! I'm Trinity, your AI business buddy.`,
      `Welcome back, ${displayName}! What can I help with today?`,
      `Hi ${displayName}! Tap me anytime for help or insights.`,
      `${timeGreeting}, ${displayName}! Let's make today productive.`,
    ];
    
    // Holiday-aware personalized greeting
    if (this.state.isHoliday && this.state.currentHoliday) {
      greetings.push(
        `${this.state.currentHoliday.greeting} ${displayName}!`,
        `Hey ${displayName}! ${this.state.currentHoliday.greeting}`
      );
    }
    
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    const thought = this.createThought(text, 'GREETING' as MascotMode, 'default', 'high');
    this.showThought(thought);
  }
  
  /**
   * Get the current user info
   */
  getUser(): UserInfo | null {
    return this.state.user;
  }
  
  // ============================================================================
  // TRINITY ROLE-AWARE CONTEXT
  // ============================================================================
  
  /**
   * Set Trinity context for role-aware persona and greetings
   */
  setTrinityContext(context: TrinityPersonaContext | null): void {
    this.state.trinityContext = context;
    
    // If context includes a custom greeting, show it
    if (context?.greeting && this.state.user && !this.state.lastGreetedUserId) {
      setTimeout(() => {
        if (this.state.trinityContext && this.state.user) {
          this.triggerRoleAwareGreeting();
        }
      }, 1000);
    }
  }
  
  /**
   * Get current Trinity context
   */
  getTrinityContext(): TrinityPersonaContext | null {
    return this.state.trinityContext;
  }
  
  /**
   * Trigger role-aware greeting based on Trinity context
   * Safe fallback to standard greeting if context is missing
   */
  triggerRoleAwareGreeting(): void {
    // Guard: require user to be set
    if (!this.state.user) {
      return;
    }
    
    const ctx = this.state.trinityContext;
    const displayName = this.getUserDisplayName() || 'there';
    const hour = new Date().getHours();
    
    let timeGreeting: string;
    if (hour >= 5 && hour < 12) {
      timeGreeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      timeGreeting = 'Good evening';
    } else {
      timeGreeting = 'Working late';
    }
    
    // Standard fallback greetings (always available)
    const standardGreetings = [
      `${timeGreeting}, ${displayName}! I'm Trinity, here to help!`,
      `Hey ${displayName}! Tap me anytime for assistance.`,
      `${timeGreeting}, ${displayName}! Ready to get things done?`,
      `Welcome back, ${displayName}! What can I help with today?`,
    ];
    
    let greeting: string;
    
    // If no context, use standard greeting
    if (!ctx) {
      greeting = standardGreetings[Math.floor(Math.random() * standardGreetings.length)];
    }
    // Root admin persona
    else if (ctx.isRootAdmin) {
      const rootGreetings = [
        `${timeGreeting}, ${displayName}. Platform systems nominal. Ready for executive review.`,
        `Welcome back, Commander ${displayName}. All services operational.`,
        `${timeGreeting}, ${displayName}. Root access confirmed. What shall we oversee?`,
        `Hey ${displayName}! Platform running smoothly. 69 actions at your command.`,
      ];
      greeting = rootGreetings[Math.floor(Math.random() * rootGreetings.length)];
    }
    // Support role persona
    else if (ctx.isSupportRole) {
      const supportGreetings = [
        `${timeGreeting}, ${displayName}! Support console ready. How can I assist?`,
        `Hey ${displayName}! Trinity Support Mode active. Let's help some users!`,
        `${timeGreeting}, ${displayName}. Support dashboard synced. Ready for tickets?`,
        `Welcome ${displayName}! I'll help you help others today.`,
      ];
      greeting = supportGreetings[Math.floor(Math.random() * supportGreetings.length)];
    }
    // Other platform staff persona
    else if (ctx.isPlatformStaff) {
      const staffGreetings = [
        `${timeGreeting}, ${displayName}! Platform staff access confirmed.`,
        `Hey ${displayName}! Ready to manage the platform together?`,
        `${timeGreeting}, ${displayName}. Full platform access enabled.`,
      ];
      greeting = staffGreetings[Math.floor(Math.random() * staffGreetings.length)];
    }
    // Trinity Pro users get executive-level greetings
    else if (ctx.hasTrinityPro) {
      const proGreetings = [
        `${timeGreeting}, ${displayName}! Trinity Pro activated. Ready for intelligent insights.`,
        `Hey ${displayName}! Your AI advisor is ready with priority support access.`,
        `${timeGreeting}, ${displayName}! Let me help you make smarter decisions today.`,
        `Welcome back, ${displayName}! Trinity Pro features are at your fingertips.`,
      ];
      greeting = proGreetings[Math.floor(Math.random() * proGreetings.length)];
    }
    // Organization owner / Business Buddy persona
    else if (ctx.isOrgOwner || ctx.hasBusinessBuddy || ctx.persona === 'business_buddy') {
      const ownerGreetings = [
        `${timeGreeting}, ${displayName}! I'm your business buddy. Let's grow your org!`,
        `Hey ${displayName}! Ready to optimize your workforce today?`,
        `${timeGreeting}, ${displayName}! Your org dashboard awaits. What's on the agenda?`,
        `Welcome back, ${displayName}! Let's make today productive for your team.`,
      ];
      greeting = ownerGreetings[Math.floor(Math.random() * ownerGreetings.length)];
    }
    // New org / onboarding persona
    else if (ctx.persona === 'onboarding_guide' || ctx.orgStats?.isNewOrg) {
      const onboardingGreetings = [
        `${timeGreeting}, ${displayName}! I'm Trinity, your setup guide. Let's get started!`,
        `Hey ${displayName}! Welcome aboard. I'll help you set everything up.`,
        `${timeGreeting}, ${displayName}! Ready to unlock the full platform? I'll guide you!`,
      ];
      greeting = onboardingGreetings[Math.floor(Math.random() * onboardingGreetings.length)];
    }
    // Manager persona
    else if (ctx.isManager) {
      const managerGreetings = [
        `${timeGreeting}, ${displayName}! Team management at your fingertips.`,
        `Hey ${displayName}! Ready to coordinate your team today?`,
        `${timeGreeting}, ${displayName}! Your schedule and team status are ready.`,
      ];
      greeting = managerGreetings[Math.floor(Math.random() * managerGreetings.length)];
    }
    // Default fallback for any other case
    else {
      greeting = standardGreetings[Math.floor(Math.random() * standardGreetings.length)];
    }
    
    // Holiday override for festive flair (50% chance)
    if (this.state.isHoliday && this.state.currentHoliday && Math.random() > 0.5) {
      greeting = `${this.state.currentHoliday.greeting} ${displayName}!`;
    }
    
    // Final safety check: ensure greeting is a valid string
    if (!greeting || typeof greeting !== 'string') {
      greeting = `Hello, ${displayName}! I'm Trinity, here to help!`;
    }
    
    const thought = this.createThought(greeting, 'GREETING' as MascotMode, 'default', 'high');
    this.showThought(thought);
    
    // Mark user as greeted after successful greeting
    if (this.state.user?.id) {
      this.state.lastGreetedUserId = this.state.user.id;
    }
  }
  
  // ============================================================================
  // ONBOARDING REMINDERS & ADVISOR MODE
  // ============================================================================
  
  /**
   * Update onboarding progress and trigger appropriate mode
   */
  updateOnboardingProgress(completedSteps: number, totalSteps: number): void {
    const wasComplete = this.state.isOnboardingComplete;
    const isNowComplete = completedSteps >= totalSteps;
    
    this.state.onboardingProgress = { completed: completedSteps, total: totalSteps };
    this.state.isOnboardingComplete = isNowComplete;
    
    // Switch to advisor mode when onboarding completes
    if (!wasComplete && isNowComplete) {
      this.state.advisorMode = true;
      this.stopPersistentReminders();
      this.triggerOnboardingComplete();
    } else if (!isNowComplete && !this.onboardingReminderTimer) {
      // Start persistent reminders if not complete and timer not running
      this.startPersistentReminders();
    }
  }
  
  /**
   * Start persistent onboarding reminders (every 45 seconds until complete)
   */
  startPersistentReminders(): void {
    if (this.onboardingReminderTimer) return;
    if (this.state.isOnboardingComplete) return;
    if (this.state.advisorMode) return;
    if (!this.state.user) return;
    
    // Trigger first reminder after 10 seconds (store handle for cleanup)
    this.initialReminderTimeout = setTimeout(() => {
      // Guard against late firing after mode transition
      if (!this.state.isOnboardingComplete && !this.state.advisorMode && this.state.onboardingProgress) {
        this.triggerOnboardingReminder(
          this.state.onboardingProgress.completed,
          this.state.onboardingProgress.total
        );
      }
      this.initialReminderTimeout = null;
    }, 10000);
    
    // Then every 45 seconds
    this.onboardingReminderTimer = setInterval(() => {
      if (!this.state.isOnboardingComplete && !this.state.advisorMode && this.state.onboardingProgress) {
        this.triggerOnboardingReminder(
          this.state.onboardingProgress.completed,
          this.state.onboardingProgress.total
        );
      }
    }, 45000);
  }
  
  /**
   * Stop persistent reminders (called when onboarding completes or user logs out)
   */
  stopPersistentReminders(): void {
    // Clear the initial 10s timeout if still pending
    if (this.initialReminderTimeout) {
      clearTimeout(this.initialReminderTimeout);
      this.initialReminderTimeout = null;
    }
    // Clear the interval timer
    if (this.onboardingReminderTimer) {
      clearInterval(this.onboardingReminderTimer);
      this.onboardingReminderTimer = null;
    }
  }
  
  /**
   * Trigger onboarding completion celebration
   */
  private triggerOnboardingComplete(): void {
    const displayName = this.getUserDisplayName();
    
    const celebrations = [
      `Congratulations ${displayName}! All setup complete. Your automation is unlocked!`,
      `${displayName}, you're all set! Enjoy full platform access and your 10% discount.`,
      `Setup complete! I'm now your AI advisor, ${displayName}. Tap me for tips anytime!`,
      `Amazing work, ${displayName}! All features unlocked. Let's make magic happen!`,
    ];
    
    const text = celebrations[Math.floor(Math.random() * celebrations.length)];
    const thought = this.createThought(text, 'ADVISING', 'default', 'high');
    this.showThought(thought);
    
    // Start advisor mode tips after a short delay
    setTimeout(() => this.startAdvisorMode(), 30000);
  }
  
  /**
   * Start advisor mode - periodic tips and insights
   */
  startAdvisorMode(): void {
    this.state.advisorMode = true;
  }
  
  /**
   * Trigger an advisor tip (for completed onboarding users)
   */
  triggerAdvisorTip(): void {
    if (!this.state.user || !this.state.advisorMode) return;
    
    const displayName = this.getUserDisplayName();
    
    const tips = [
      `Pro tip, ${displayName}: Use AI scheduling to save 8+ hours per week!`,
      `${displayName}, check out Analytics for insights on your workforce efficiency.`,
      `Need a hand? I can help with payroll, scheduling, or invoicing anytime.`,
      `${displayName}, your team's performance data is ready in the Dashboard!`,
      `Quick tip: Set up shift reminders to reduce no-shows by 40%.`,
      `${displayName}, have you explored our compliance automation? It's a game-changer!`,
      `Try the AI-powered schedule optimizer - it learns from your patterns!`,
      `${displayName}, remember you can chat with me anytime for help or insights.`,
      `New feature alert: Real-time notifications keep you updated on everything!`,
      `${displayName}, your invoice automation is ready - just add clients to get started.`,
    ];
    
    const text = tips[Math.floor(Math.random() * tips.length)];
    const thought = this.createThought(text, 'ADVISING', 'default', 'low');
    this.queueThought(thought);
  }

  // ============================================================================
  // BUSINESS BUDDY CREDIT AWARENESS
  // ============================================================================
  
  /**
   * Update credit status and trigger warnings if needed
   */
  updateCreditStatus(status: CreditStatus): void {
    const previousStatus = this.state.creditStatus;
    this.state.creditStatus = status;
    
    // Skip if on public page or no user
    if (this.state.isOnPublicPage || !this.state.user) return;
    
    // Don't spam warnings - max once per 10 minutes
    const now = Date.now();
    const MIN_WARNING_INTERVAL = 10 * 60 * 1000; // 10 minutes
    
    if (this.state.lastCreditWarningAt && (now - this.state.lastCreditWarningAt) < MIN_WARNING_INTERVAL) {
      return;
    }
    
    // Critical warning (below 5%)
    if (status.isCritical && (!previousStatus || !previousStatus.isCritical)) {
      this.triggerCriticalCreditWarning(status);
      this.state.lastCreditWarningAt = now;
      return;
    }
    
    // Low warning (below 20%)
    if (status.isLow && (!previousStatus || !previousStatus.isLow)) {
      this.triggerLowCreditWarning(status);
      this.state.lastCreditWarningAt = now;
    }
  }
  
  /**
   * Get current credit status
   */
  getCreditStatus(): CreditStatus | null {
    return this.state.creditStatus;
  }
  
  /**
   * Trigger critical credit warning (below 5%)
   */
  private triggerCriticalCreditWarning(status: CreditStatus): void {
    const displayName = this.getUserDisplayName();
    
    const warnings = [
      `${displayName}, urgent: Only ${status.currentBalance} credits left! AI features may pause soon.`,
      `Running very low on credits (${status.currentBalance} remaining). Consider adding more!`,
      `${displayName}, heads up - credits critically low! Add more to keep AI features running.`,
      `Credit alert: ${status.currentBalance} left. Check Billing to purchase more credits!`,
    ];
    
    const text = warnings[Math.floor(Math.random() * warnings.length)];
    const thought = this.createThought(text, 'WARNING' as MascotMode, 'default', 'urgent');
    this.showThought(thought);
  }
  
  /**
   * Trigger low credit warning (below 20%)
   */
  private triggerLowCreditWarning(status: CreditStatus): void {
    const displayName = this.getUserDisplayName();
    const percentRemaining = Math.round((1 - status.percentUsed) * 100);
    
    const warnings = [
      `${displayName}, your credits are at ${percentRemaining}%. Consider topping up!`,
      `Friendly reminder: ${status.currentBalance} credits remaining (${percentRemaining}%).`,
      `${displayName}, running a bit low on AI credits. Visit Billing to add more!`,
      `Credit check: ${percentRemaining}% remaining. Need more AI power?`,
    ];
    
    const text = warnings[Math.floor(Math.random() * warnings.length)];
    const thought = this.createThought(text, 'ADVISING', 'default', 'normal');
    this.queueThought(thought);
  }
  
  /**
   * Trigger credit purchase celebration
   */
  triggerCreditPurchaseCelebration(amount: number): void {
    const displayName = this.getUserDisplayName();
    
    const celebrations = [
      `Thanks ${displayName}! ${amount.toLocaleString()} credits added. AI features are fully powered!`,
      `Credit purchase confirmed! ${amount.toLocaleString()} credits ready to go, ${displayName}!`,
      `${displayName}, your account has ${amount.toLocaleString()} fresh credits. Let's get to work!`,
      `Excellent! ${amount.toLocaleString()} credits added. Your AI automation is supercharged!`,
    ];
    
    const text = celebrations[Math.floor(Math.random() * celebrations.length)];
    const thought = this.createThought(text, 'HAPPY' as MascotMode, 'default', 'high');
    this.showThought(thought);
  }
  
  /**
   * Get credit status summary for display
   */
  getCreditSummary(): string | null {
    const status = this.state.creditStatus;
    if (!status) return null;
    
    const percentRemaining = Math.round((1 - status.percentUsed) * 100);
    return `${status.currentBalance.toLocaleString()} credits (${percentRemaining}%)`;
  }
  
  /**
   * Trigger an onboarding reminder based on progress
   */
  triggerOnboardingReminder(completedSteps: number, totalSteps: number): void {
    if (!this.state.user) return;
    
    // Don't remind if already complete
    if (this.state.isOnboardingComplete) {
      this.triggerAdvisorTip();
      return;
    }
    
    const displayName = this.getUserDisplayName();
    const remaining = totalSteps - completedSteps;
    const progressPercent = Math.round((completedSteps / totalSteps) * 100);
    
    let reminders: string[];
    
    if (completedSteps === 0) {
      reminders = [
        `Hey ${displayName}! Let's get your organization set up. I'll guide you through!`,
        `${displayName}, ready to unlock automation? Just ${totalSteps} quick steps to go!`,
        `Welcome ${displayName}! Complete your setup to unlock all features + a 10% discount.`,
        `${displayName}, tap me to start your setup journey - I'll help every step!`,
      ];
    } else if (progressPercent < 50) {
      reminders = [
        `Nice start, ${displayName}! ${remaining} more steps to unlock automation.`,
        `You're ${progressPercent}% done, ${displayName}! Keep going for that 10% discount.`,
        `${displayName}, tap me for help with your next setup step!`,
        `Great progress! ${remaining} steps left to unlock AI features, ${displayName}.`,
      ];
    } else if (progressPercent < 100) {
      reminders = [
        `Almost there, ${displayName}! Just ${remaining} steps to full automation access.`,
        `${progressPercent}% complete! Your 10% discount is waiting, ${displayName}.`,
        `So close, ${displayName}! Finish setup to unlock AI-powered features.`,
        `${displayName}, you're ${progressPercent}% there! Let's finish this together.`,
      ];
    } else {
      // 100% complete - this shouldn't happen but handle it
      this.triggerOnboardingComplete();
      return;
    }
    
    const text = reminders[Math.floor(Math.random() * reminders.length)];
    const thought = this.createThought(text, 'ADVISING', 'default', 'normal');
    this.queueThought(thought);
  }
  
  /**
   * Trigger a specific step guidance message
   */
  triggerStepGuidance(stepName: string, stepDescription: string): void {
    const displayName = this.getUserDisplayName();
    
    const guidance = [
      `Let's work on "${stepName}", ${displayName}! ${stepDescription}`,
      `Next up: ${stepName}. ${stepDescription}`,
      `Time for ${stepName}! I'll help you through this, ${displayName}.`,
    ];
    
    const text = guidance[Math.floor(Math.random() * guidance.length)];
    const thought = this.createThought(text, 'ADVISING', 'default', 'high');
    this.showThought(thought);
  }
  
  startRotation(): void {
    if (this.rotationTimer) return;
    
    if (this.state.isHoliday) {
      this.triggerHolidayGreeting();
    }
    
    this.rotationTimer = setInterval(() => {
      if (!this.state.currentThought && this.state.queue.length === 0) {
        // Prioritize advisor tips for users who completed onboarding (30% chance)
        if (this.state.advisorMode && this.state.isOnboardingComplete && Math.random() < 0.3) {
          this.triggerAdvisorTip();
        } else if (this.state.isHoliday && this.state.currentHoliday && Math.random() > 0.7) {
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
