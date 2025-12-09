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

// Org intelligence for enriched Trinity context
export interface OrgIntelligence {
  automationReadiness: {
    score: number;
    level: 'hand_held' | 'graduated' | 'full_automation';
    canGraduate: boolean;
    topIssues: string[];
    recommendations: string[];
  } | null;
  workboardStats: {
    pendingTasks: number;
    completedToday: number;
    failedToday: number;
    avgCompletionTimeMs: number;
  } | null;
  notificationSummary: {
    unreadCount: number;
    urgentCount: number;
    categories: { type: string; count: number }[];
  } | null;
  businessMetrics: {
    invoicesPendingCount: number;
    invoicesOverdueCount: number;
    recentActivityScore: number;
  } | null;
  priorityInsights: string[];
}

// Platform diagnostics for Guru mode
export interface PlatformDiagnostics {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  activeWorkspaces: number;
  totalUsers: number;
  recentErrors: number;
  subagentHealth: { healthy: number; degraded: number; critical: number };
  fastModeStats: { successRate: number; avgDuration: number; slaBreeches: number; totalExecutions: number };
  upgradeOpportunities: { workspaceId: string; workspaceName: string; reason: string }[];
  engagementAlerts: { type: string; message: string; priority: 'low' | 'medium' | 'high' }[];
  pendingNotificationSuggestions: number;
  supportTicketBacklog: { open: number; urgent: number; avgAgeHours: number };
  trialExpirations: { workspaceId: string; workspaceName: string; daysLeft: number }[];
  churnRiskCount: number;
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
  orgIntelligence?: OrgIntelligence;
  platformDiagnostics?: PlatformDiagnostics;
  trinityMode?: 'demo' | 'business_pro' | 'guru';
  persona: 'executive_advisor' | 'support_partner' | 'business_buddy' | 'onboarding_guide' | 'platform_guru' | 'standard';
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
  // Demo mode tier tracking for upgrade nudges
  businessBuddyTier: 'PUBLIC_DEMO' | 'LOGGED_IN_FREE' | 'BUSINESS_BUDDY';
  lastUpgradeNudgeAt: number | null;
}

type ThoughtListener = (thought: Thought | null) => void;

// Calculate reading time based on text length (average reading speed: ~200 words/min for casual reading)
// Minimum 6 seconds, maximum 30 seconds
function calculateReadingTime(text: string): number {
  const words = text.split(/\s+/).length;
  const averageReadingWPM = 150; // Slower for comprehension
  const baseTimeMs = (words / averageReadingWPM) * 60 * 1000;
  const minTime = 6000; // 6 seconds minimum
  const maxTime = 30000; // 30 seconds maximum
  // Add extra time for punctuation (pauses)
  const punctuationPauses = (text.match(/[.!?,;:]/g) || []).length * 200;
  return Math.min(maxTime, Math.max(minTime, baseTimeMs + punctuationPauses + 2000));
}

class ThoughtManager {
  private state: ThoughtManagerState;
  private listeners: Set<ThoughtListener> = new Set();
  private rotationTimer: ReturnType<typeof setInterval> | null = null;
  private rotationStartupTimer: ReturnType<typeof setTimeout> | null = null; // Guards against duplicate starts
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  
  private onboardingReminderTimer: ReturnType<typeof setInterval> | null = null;
  private initialReminderTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // AI Brain readiness gate - prevents showing thoughts before AI session is ready
  private aiSessionReady: boolean = false;
  private aiReadyTimestamp: number = 0;
  private warmupPollingActive: boolean = false; // Idempotent guard for polling loop
  private static readonly MIN_WARMUP_DELAY_MS = 2000; // Wait 2s after initialization before first bubble
  
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
      businessBuddyTier: 'PUBLIC_DEMO',
      lastUpgradeNudgeAt: null,
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
  
  /**
   * Mark AI session as ready - gates first bubble display
   * Called when Trinity context is successfully fetched from /api/trinity/context
   */
  setAiSessionReady(): void {
    if (!this.aiSessionReady) {
      this.aiSessionReady = true;
      this.aiReadyTimestamp = Date.now();
      console.log('[Trinity] AI session ready - warmup period started');
    }
  }
  
  /**
   * Check if AI session is ready and warmup period has passed
   */
  private isReadyForFirstBubble(): boolean {
    if (!this.aiSessionReady) return false;
    const elapsed = Date.now() - this.aiReadyTimestamp;
    return elapsed >= ThoughtManager.MIN_WARMUP_DELAY_MS;
  }
  
  /**
   * Get remaining warmup delay in milliseconds
   */
  private getRemainingWarmupDelay(): number {
    if (!this.aiSessionReady) return ThoughtManager.MIN_WARMUP_DELAY_MS;
    const elapsed = Date.now() - this.aiReadyTimestamp;
    return Math.max(0, ThoughtManager.MIN_WARMUP_DELAY_MS - elapsed);
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
    // CRITICAL: Gate first bubble display on warmup readiness
    // This is the final safeguard - no thought can render before AI Brain is ready
    const isFirstBubble = this.state.history.length === 0 && !this.state.currentThought;
    if (isFirstBubble && !this.isReadyForFirstBubble()) {
      // Queue thought and wait for readiness instead of showing immediately
      if (thought.priority === 'urgent' || thought.priority === 'high') {
        this.state.queue.unshift(thought);
      } else {
        this.state.queue.push(thought);
      }
      this.waitForReadinessAndShow();
      return;
    }
    
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
    }
    
    this.state.currentThought = thought;
    this.state.history.push(thought);
    if (this.state.history.length > 50) {
      this.state.history.shift();
    }
    
    this.notify();
    
    // Use dynamic reading time based on text length instead of fixed duration
    const displayTime = calculateReadingTime(thought.text);
    thought.expiresAt = Date.now() + displayTime;
    
    this.displayTimer = setTimeout(() => {
      this.clearThought();
    }, displayTime);
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
    
    // Gate first bubble on warmup readiness (delegates to showThought's gate)
    this.showThought(thought);
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
    const isFirstBubble = this.state.history.length === 0 && !this.state.currentThought;
    
    // CRITICAL: Gate ALL first bubbles (including high/urgent priority) on warmup readiness
    // This ensures no thoughts display before AI Brain is connected and warmup period passes
    if (isFirstBubble && !this.isReadyForFirstBubble()) {
      // Add to queue based on priority but don't show yet
      if (thought.priority === 'urgent' || thought.priority === 'high') {
        this.state.queue.unshift(thought);
      } else {
        this.state.queue.push(thought);
      }
      // Start polling (idempotent - only one loop runs)
      this.waitForReadinessAndShow();
      return;
    }
    
    // Post-warmup: normal priority handling
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
  
  /**
   * Poll until AI session is ready and warmup has passed, then show queued thought
   * Polls every 200ms to check readiness, max 10s timeout
   * Idempotent - only one polling loop runs at a time
   */
  private waitForReadinessAndShow(): void {
    // Idempotent guard - prevent multiple concurrent polling loops
    if (this.warmupPollingActive) {
      return;
    }
    this.warmupPollingActive = true;
    
    const maxWaitMs = 10000; // Max 10s wait
    const pollIntervalMs = 200;
    let elapsed = 0;
    
    const checkAndShow = () => {
      elapsed += pollIntervalMs;
      
      if (this.isReadyForFirstBubble()) {
        // Ready! Show the first queued thought
        this.warmupPollingActive = false;
        if (!this.state.currentThought && this.state.queue.length > 0) {
          setTimeout(() => {
            if (!this.state.currentThought && this.state.queue.length > 0) {
              this.showThought(this.state.queue.shift()!);
            }
          }, 500); // Small buffer for human-paced appearance
        }
        return;
      }
      
      if (elapsed >= maxWaitMs) {
        // Timeout - show anyway to prevent stuck state
        this.warmupPollingActive = false;
        console.log('[Trinity] Warmup timeout reached - showing first bubble');
        if (!this.state.currentThought && this.state.queue.length > 0) {
          this.showThought(this.state.queue.shift()!);
        }
        return;
      }
      
      // Keep polling
      setTimeout(checkAndShow, pollIntervalMs);
    };
    
    setTimeout(checkAndShow, pollIntervalMs);
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
   * Routes through showThought() to honor warmup gating.
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
      priority: 'urgent', // Use urgent to show immediately (after warmup gate)
      source: 'action',
      expiresAt: Date.now() + MASCOT_CONFIG.thoughts.displayDuration,
      isActionState: true, // Flag for MagicFloatingText to animate ellipsis
    };
    
    // Route through showThought to honor warmup gating
    // This ensures no action state shows before AI Brain is ready
    this.showThought(actionThought);
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
    
    // Clean up when user logs out
    if (!user) {
      this.stopPersistentReminders();
      this.stopRotation(); // Stop thought rotation
      this.state.onboardingProgress = null;
      this.state.isOnboardingComplete = false;
      this.state.advisorMode = false;
      this.state.lastGreetedUserId = null; // Reset so next user gets greeted
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
    
    // Start thought rotation when user is set and context exists
    if (user && this.state.trinityContext && !this.rotationTimer) {
      this.startPersonaAwareRotation();
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
    
    // Personalized greetings with name - professional business tone
    const greetings = [
      `${timeGreeting}, ${displayName}. How may I assist you today?`,
      `${timeGreeting}, ${displayName}. I'm Trinity, your AI assistant.`,
      `Welcome back, ${displayName}. What can I help you accomplish?`,
      `${timeGreeting}, ${displayName}. Your AI assistant is ready.`,
      `${timeGreeting}, ${displayName}. Standing by to assist.`,
    ];
    
    // Holiday-aware personalized greeting
    if (this.state.isHoliday && this.state.currentHoliday) {
      greetings.push(
        `${this.state.currentHoliday.greeting}, ${displayName}.`,
        `${timeGreeting}, ${displayName}. ${this.state.currentHoliday.greeting}`
      );
    }
    
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    const thought = this.createThought(text, 'GREETING' as MascotMode, 'default', 'high');
    // Route through queueThought to honor warmup gate
    this.queueThought(thought);
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
   * Called when /api/trinity/context returns successfully - marks AI session ready
   */
  setTrinityContext(context: TrinityPersonaContext | null): void {
    this.state.trinityContext = context;
    
    // Mark AI session as ready when context is set (enables bubble display)
    if (context) {
      this.setAiSessionReady();
    }
    
    // Trigger greeting with proper warmup delay - ONCE per user session only
    // Only greet if: context exists, user exists, AND user hasn't been greeted yet
    const userId = this.state.user?.id;
    if (context && userId && this.state.lastGreetedUserId !== userId) {
      // Mark as greeted immediately to prevent duplicate triggers
      this.state.lastGreetedUserId = userId;
      const warmupDelay = this.getRemainingWarmupDelay();
      setTimeout(() => {
        // Verify user is still the same at trigger time
        if (this.state.trinityContext && this.state.user?.id === userId) {
          this.triggerRoleAwareGreeting();
        }
      }, warmupDelay + 1500); // Wait for warmup + 1.5s for human-paced appearance
    }
    
    // Start thought rotation when we have a valid context and user
    if (context && this.state.user && !this.rotationTimer) {
      this.startPersonaAwareRotation();
    }
    
    // Stop rotation if context is cleared
    if (!context && this.rotationTimer) {
      this.stopRotation();
    }
  }
  
  /**
   * Start persona-aware thought rotation
   * Generates contextual thoughts based on user's role and subscription
   */
  private startPersonaAwareRotation(): void {
    // Guard against duplicate starts during startup delay
    if (this.rotationTimer || this.rotationStartupTimer) return;
    
    // Initial greeting delay - set timer immediately to prevent duplicate calls
    this.rotationStartupTimer = setTimeout(() => {
      // Clear startup timer reference
      this.rotationStartupTimer = null;
      
      // Don't start if already stopped (e.g., user logged out during delay)
      if (!this.state.user || !this.state.trinityContext) {
        return;
      }
      
      // Start the rotation loop
      this.rotationTimer = setInterval(() => {
        // Don't generate new thought if one is showing or queue has items
        if (this.state.currentThought || this.state.queue.length > 0) {
          return;
        }
        
        // Generate persona-appropriate thought
        this.generatePersonaThought();
      }, MASCOT_CONFIG.thoughts.rotateInterval);
    }, 5000); // 5 second delay after initial greeting
  }
  
  /**
   * Generate a thought based on current persona context
   * Attempts to fetch from AI first (60% of the time), falls back to local pools
   */
  private generatePersonaThought(): void {
    const ctx = this.state.trinityContext;
    const displayName = this.getUserDisplayName() || 'there';
    
    // 90% chance to try fetching AI-generated thought from server
    if (Math.random() < 0.9) {
      this.fetchAIThought().then(aiThought => {
        if (aiThought) {
          const thought = this.createThought(aiThought, 'ADVISING', 'ai', 'normal');
          this.queueThought(thought);
        } else {
          // Fallback to local thought
          this.generateLocalThought(ctx, displayName);
        }
      }).catch(() => {
        // On error, use local thought
        this.generateLocalThought(ctx, displayName);
      });
      return;
    }
    
    // Use local thought pools
    this.generateLocalThought(ctx, displayName);
  }
  
  /**
   * Generate a thought from local persona-specific pools
   * Uses comprehensive business expertise across growth, operations, admin, sales, invoicing, payroll, and scheduling
   * Prioritizes live org intelligence data when available
   */
  private generateLocalThought(ctx: TrinityPersonaContext | null, displayName: string): void {
    let thoughtPool: string[];
    
    // Priority 1: Use live org intelligence insights if available
    const intel = ctx?.orgIntelligence;
    if (intel?.priorityInsights?.length) {
      // 70% chance to surface priority insights
      if (Math.random() < 0.7) {
        const insight = intel.priorityInsights[0];
        const thought = this.createThought(
          `${displayName}, ${insight}`,
          'ADVISING',
          'ai',
          'high'
        );
        this.queueThought(thought);
        return;
      }
    }
    
    // Priority 2: Data-driven insights from org intelligence
    const dataThoughts: string[] = [];
    if (intel?.automationReadiness) {
      const ar = intel.automationReadiness;
      if (ar.canGraduate) {
        dataThoughts.push(`${displayName}, your org is ready to graduate to ${ar.level === 'hand_held' ? 'Graduated' : 'Full Automation'} mode!`);
      }
      if (ar.score >= 80) {
        dataThoughts.push(`Automation confidence is ${ar.score}%. Your AI assistants are performing well.`);
      } else if (ar.score < 50) {
        dataThoughts.push(`Automation score is ${ar.score}%. Let's work on building confidence.`);
      }
      if (ar.recommendations?.length > 0) {
        dataThoughts.push(ar.recommendations[0]);
      }
    }
    if (intel?.workboardStats) {
      const wb = intel.workboardStats;
      if (wb.pendingTasks > 5) {
        dataThoughts.push(`${wb.pendingTasks} tasks pending in your AI workboard.`);
      }
      if (wb.completedToday > 0) {
        dataThoughts.push(`${wb.completedToday} AI tasks completed today. Great progress!`);
      }
    }
    if (intel?.notificationSummary) {
      const ns = intel.notificationSummary;
      if (ns.unreadCount > 10) {
        dataThoughts.push(`You have ${ns.unreadCount} unread notifications to review.`);
      }
      if (ns.urgentCount > 0) {
        dataThoughts.push(`${ns.urgentCount} urgent notifications need your attention.`);
      }
    }
    if (intel?.businessMetrics) {
      const bm = intel.businessMetrics;
      if (bm.invoicesOverdueCount > 0) {
        dataThoughts.push(`${bm.invoicesOverdueCount} overdue invoice(s) need follow-up.`);
      }
      if (bm.invoicesPendingCount > 3) {
        dataThoughts.push(`${bm.invoicesPendingCount} invoices awaiting payment.`);
      }
    }
    
    // 50% chance to use data-driven thoughts when available
    if (dataThoughts.length > 0 && Math.random() < 0.5) {
      const text = dataThoughts[Math.floor(Math.random() * dataThoughts.length)];
      const thought = this.createThought(text, 'ADVISING', 'ai', 'normal');
      this.queueThought(thought);
      return;
    }
    
    // Fallback to persona-based thought pools
    // GURU MODE - Platform diagnostics, health analysis, engagement opportunities
    if (ctx?.trinityMode === 'guru' || ctx?.persona === 'platform_guru') {
      const diag = ctx?.platformDiagnostics;
      thoughtPool = [];
      
      // Priority: Surface platform diagnostics data
      if (diag) {
        // Health status thoughts
        if (diag.overallHealth === 'healthy') {
          thoughtPool.push(`${displayName}, platform health is optimal. ${diag.activeWorkspaces} active workspaces, ${diag.totalUsers} users.`);
          thoughtPool.push(`All systems green. ${diag.subagentHealth.healthy} of ${diag.subagentHealth.healthy + diag.subagentHealth.degraded + diag.subagentHealth.critical} subagents performing well.`);
        } else if (diag.overallHealth === 'degraded') {
          thoughtPool.push(`${displayName}, platform health is degraded. ${diag.recentErrors} errors today need attention.`);
          thoughtPool.push(`Monitoring alert: Some systems need attention. Let me show you the details.`);
        } else if (diag.overallHealth === 'critical') {
          thoughtPool.push(`${displayName}, critical platform issues detected. ${diag.recentErrors} failures today - investigation recommended.`);
        }
        
        // Upgrade opportunities
        if (diag.upgradeOpportunities.length > 0) {
          const opp = diag.upgradeOpportunities[0];
          thoughtPool.push(`${displayName}, I found an upgrade opportunity: ${opp.workspaceName} - ${opp.reason}`);
          thoughtPool.push(`${diag.upgradeOpportunities.length} workspace(s) showing high engagement on free tier. Good upsell candidates.`);
        }
        
        // Engagement alerts
        if (diag.engagementAlerts.length > 0) {
          const highPriority = diag.engagementAlerts.filter(a => a.priority === 'high');
          if (highPriority.length > 0) {
            thoughtPool.push(`${displayName}, high priority alert: ${highPriority[0].message}`);
          }
          const medPriority = diag.engagementAlerts.filter(a => a.priority === 'medium');
          if (medPriority.length > 0) {
            thoughtPool.push(`${medPriority.length} engagement alert(s) need review: ${medPriority[0].message}`);
          }
        }
        
        // Subagent health
        if (diag.subagentHealth.degraded > 0) {
          thoughtPool.push(`${diag.subagentHealth.degraded} subagent(s) showing degraded confidence. Want me to investigate?`);
        }
        if (diag.subagentHealth.critical > 0) {
          thoughtPool.push(`${displayName}, ${diag.subagentHealth.critical} subagent(s) need immediate attention - confidence critically low.`);
        }
        
        // Support ticket backlog - NEW
        if (diag.supportTicketBacklog) {
          if (diag.supportTicketBacklog.urgent > 0) {
            thoughtPool.push(`${displayName}, ${diag.supportTicketBacklog.urgent} urgent support tickets need immediate attention.`);
          }
          if (diag.supportTicketBacklog.open > 10) {
            thoughtPool.push(`Support queue has ${diag.supportTicketBacklog.open} open tickets. Want me to prioritize them?`);
          }
        }
        
        // Trial expirations - NEW
        if (diag.trialExpirations && diag.trialExpirations.length > 0) {
          const urgent = diag.trialExpirations.filter(t => t.daysLeft <= 3);
          if (urgent.length > 0) {
            thoughtPool.push(`${displayName}, ${urgent.length} trial(s) expiring within 3 days - conversion opportunity!`);
            thoughtPool.push(`${urgent[0].workspaceName} trial expires in ${urgent[0].daysLeft} day(s). Shall I draft an outreach?`);
          }
        }
        
        // Churn risk - NEW
        if (diag.churnRiskCount > 0) {
          thoughtPool.push(`${displayName}, ${diag.churnRiskCount} workspace(s) showing churn risk - low activity for 30+ days.`);
          thoughtPool.push(`I've identified ${diag.churnRiskCount} inactive accounts. Want me to suggest re-engagement strategies?`);
        }
        
        // FAST mode performance - NEW
        if (diag.fastModeStats && diag.fastModeStats.totalExecutions > 0) {
          if (diag.fastModeStats.successRate < 90) {
            thoughtPool.push(`${displayName}, FAST mode success rate is ${diag.fastModeStats.successRate}% - below target. Investigating patterns.`);
          }
          if (diag.fastModeStats.slaBreeches > 5) {
            thoughtPool.push(`${diag.fastModeStats.slaBreeches} FAST mode SLA breaches this week. Credit refunds may be due.`);
          }
          if (diag.fastModeStats.successRate >= 95) {
            thoughtPool.push(`FAST mode running at ${diag.fastModeStats.successRate}% success across ${diag.fastModeStats.totalExecutions} executions this week.`);
          }
        }
        
        // Pending notification suggestions - NEW
        if (diag.pendingNotificationSuggestions > 0) {
          thoughtPool.push(`${displayName}, ${diag.pendingNotificationSuggestions} notification suggestion(s) awaiting approval in the System tab.`);
          thoughtPool.push(`I've drafted ${diag.pendingNotificationSuggestions} platform notification(s). Check the System tab to review and approve.`);
        }
      }
      
      // Guru mode general thoughts - proactive platform management
      thoughtPool.push(
        `${displayName}, I'm continuously monitoring platform health and looking for optimization opportunities.`,
        `Platform diagnostics running. I can suggest new features or improvements for our users.`,
        `${displayName}, shall I analyze engagement patterns across workspaces?`,
        `I can identify orgs that might benefit from Business Buddy based on their activity.`,
        `Running automated checks on subagent performance and confidence scores.`,
        `${displayName}, I can draft notification suggestions for the System tab when I spot opportunities.`,
        `Monitoring FAST mode execution for SLA compliance and credit efficiency.`,
        `I'm tracking automation graduation readiness across all workspaces.`,
        `${displayName}, want me to summarize today's platform activity and trends?`,
        `I can suggest workflow improvements based on common support patterns.`,
        `Analyzing user engagement - I can identify feature adoption opportunities.`,
        `${displayName}, I've got visibility into all org metrics. Ask me anything about platform performance.`,
        // Swarm Commander insights - NEW
        `${displayName}, the AI swarm is buzzing perfectly! All agents reporting healthy.`,
        `${displayName}, I'm monitoring agent interactions in real-time. The War Room is clear.`,
        `Need to see how agents are collaborating? I can show you the swarm topology.`,
        `Budget Watchdog active - I'll flag any tasks that might be expensive before dispatch.`,
        `I can estimate token costs before executing complex operations.`,
        `Agent Court is ready. Any conflicts between subagents will come to you for resolution.`,
        `Forensic Replay available - I can rewind any workflow to find root causes.`,
        `${displayName}, shall I calculate ROI for your AI automation this week?`,
        `Loop detector active. If agents get stuck in arguments, I'll pause and escalate.`,
        `I'm watching for any agent conflicts or infinite loops. You're the judge if they can't agree.`,
      );
    } else if (ctx?.isRootAdmin || ctx?.isPlatformStaff) {
      // Fallback for platform staff without explicit guru mode
      thoughtPool = [
        `${displayName}, platform metrics are within normal parameters.`,
        `All systems operational. Standing by for review.`,
        `Platform monitoring active. Status update available on request.`,
        `Ready to assist with platform operations.`,
        `Multi-tenant health checks complete. All orgs are stable.`,
        `I can analyze system-wide usage patterns for optimization.`,
        `Subagent confidence scores are tracking well across workspaces.`,
      ];
    } else if (ctx?.isSupportRole) {
      // Support role without guru mode
      thoughtPool = [
        `${displayName}, support queue is available for review.`,
        `Support systems ready. I can help streamline responses.`,
        `I can assist with drafting responses or researching solutions.`,
        `Available to help with complex support cases.`,
        `I can escalate tickets to specialized subagents if needed.`,
        `Knowledge base suggestions ready based on ticket patterns.`,
      ];
    } else if (ctx?.hasTrinityPro) {
      // COMPREHENSIVE BUSINESS EXPERTISE - Trinity Pro level
      thoughtPool = [
        // Growth & Strategy
        `${displayName}, I've analyzed growth opportunities in your market segment.`,
        `Revenue trends show patterns. Want me to identify optimization areas?`,
        `I can model customer acquisition cost versus lifetime value for you.`,
        `Your competitive positioning analysis is ready when you need it.`,
        // Operations Excellence
        `Operational efficiency metrics are available. Shall I highlight bottlenecks?`,
        `I've identified labor cost optimization opportunities worth reviewing.`,
        `Break compliance is at 98% - one department needs attention.`,
        `Schedule coverage gaps detected for next week. Want recommendations?`,
        // Sales & Revenue
        `Sales pipeline analysis shows promising conversion patterns.`,
        `I can help forecast revenue based on current booking trends.`,
        `Client retention metrics suggest upsell opportunities.`,
        `Your invoicing cycle efficiency is above industry average.`,
        // Financial Management
        `Payroll projections for this period are ready for review.`,
        `I can simulate overtime scenarios to optimize labor spend.`,
        `Tax withholding calculations are current. Any adjustments needed?`,
        `Invoice aging report shows 3 overdue accounts needing attention.`,
        // Workforce Intelligence
        `Employee sentiment analysis from recent interactions is available.`,
        `Scheduling AI confidence is high - ready for autonomous mode.`,
        `I can generate workforce forecasts based on historical patterns.`,
        `Time tracking anomalies detected. Want me to flag them?`,
      ];
    } else if (ctx?.hasBusinessBuddy || ctx?.isOrgOwner) {
      // BUSINESS OWNER EXPERTISE - comprehensive advisor
      thoughtPool = [
        // Growth Focus
        `${displayName}, how can I help grow your business today?`,
        `I can analyze your team's productivity trends.`,
        `Ready to help with strategic workforce planning.`,
        `Would you like insights on reducing labor costs?`,
        // Operations
        `Schedule optimization opportunities are available.`,
        `I can help balance workload across your teams.`,
        `Break compliance monitoring is active and healthy.`,
        `Standing by to support your business operations.`,
        // Financial
        `Payroll processing is on track for this cycle.`,
        `I can help review invoicing efficiency.`,
        `Labor cost projections are available on request.`,
        // Sales & Admin
        `Client billing is current. Any overdue follow-ups?`,
        `I can draft professional communications for you.`,
        `Administrative task automation suggestions are ready.`,
      ];
    } else if (ctx?.isManager) {
      // MANAGER-FOCUSED EXPERTISE
      thoughtPool = [
        `${displayName}, team schedule status is available.`,
        `I can assist with shift adjustments and swaps.`,
        `Time-off request management is streamlined and ready.`,
        `Ready to help with team coordination.`,
        `Employee availability conflicts detected - want solutions?`,
        `I can generate team performance summaries.`,
        `Overtime alerts are configured. Current projections look good.`,
        `Standing by to optimize your scheduling workflow.`,
      ];
    } else {
      // STANDARD USER - helpful assistance
      thoughtPool = [
        `${displayName}, how may I assist you?`,
        `I'm available if you have questions.`,
        `Standing by to assist with your tasks.`,
        `How can I help you today?`,
        `Ready to help with scheduling or time tracking.`,
        `I can answer questions about your shifts or time off.`,
      ];
    }
    
    // Add occasional holiday flair
    if (this.state.isHoliday && this.state.currentHoliday && Math.random() > 0.7) {
      const holidayThoughts = this.state.currentHoliday.thoughts;
      thoughtPool = [...thoughtPool, ...holidayThoughts];
    }
    
    // For LOGGED_IN_FREE users: 20% chance to show upgrade nudge instead
    if (this.shouldShowUpgradeNudge() && Math.random() < 0.2) {
      this.triggerUpgradeNudge();
      return;
    }
    
    const text = thoughtPool[Math.floor(Math.random() * thoughtPool.length)];
    const thought = this.createThought(text, 'IDLE', 'ai', 'low');
    this.queueThought(thought);
  }
  
  /**
   * Fetch an AI-generated thought from the server
   */
  private async fetchAIThought(): Promise<string | null> {
    try {
      const response = await fetch('/api/trinity/thought', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trigger: 'idle_rotation' }),
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return data.success && data.thought ? data.thought : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get current Trinity context
   */
  getTrinityContext(): TrinityPersonaContext | null {
    return this.state.trinityContext;
  }
  
  // ============================================================================
  // DEMO MODE & UPGRADE NUDGES
  // ============================================================================
  
  /**
   * Set Business Buddy tier for demo mode awareness
   * Integrates upgrade nudges for LOGGED_IN_FREE users
   */
  setBusinessBuddyTier(tier: 'PUBLIC_DEMO' | 'LOGGED_IN_FREE' | 'BUSINESS_BUDDY'): void {
    this.state.businessBuddyTier = tier;
  }
  
  /**
   * Get current Business Buddy tier
   */
  getBusinessBuddyTier(): 'PUBLIC_DEMO' | 'LOGGED_IN_FREE' | 'BUSINESS_BUDDY' {
    return this.state.businessBuddyTier;
  }
  
  /**
   * Check if user should see upgrade nudges (LOGGED_IN_FREE users only)
   */
  shouldShowUpgradeNudge(): boolean {
    return this.state.businessBuddyTier === 'LOGGED_IN_FREE';
  }
  
  /**
   * Trigger an upgrade suggestion thought for LOGGED_IN_FREE users
   * Called periodically during thought rotation for non-subscribers
   */
  triggerUpgradeNudge(): void {
    // Only show for logged-in free users, not on public pages
    if (this.state.businessBuddyTier !== 'LOGGED_IN_FREE' || this.state.isOnPublicPage) {
      return;
    }
    
    // Rate limit: max once per 5 minutes
    const now = Date.now();
    const MIN_NUDGE_INTERVAL = 5 * 60 * 1000; // 5 minutes
    if (this.state.lastUpgradeNudgeAt && (now - this.state.lastUpgradeNudgeAt) < MIN_NUDGE_INTERVAL) {
      return;
    }
    
    const displayName = this.getUserDisplayName();
    
    const upgradeNudges = [
      `${displayName}, I could analyze your schedules and suggest optimizations with Business Buddy!`,
      `Want me to help with real-time workforce insights? Upgrade to Business Buddy!`,
      `${displayName}, Business Buddy unlocks AI-powered scheduling and analytics.`,
      `I have lots of smart features waiting for you! Check out Business Buddy add-on.`,
      `${displayName}, upgrade to Business Buddy for personalized AI business advice!`,
      `Unlock my full potential! Business Buddy gives you AI scheduling and insights.`,
      `Psst! Business Buddy subscribers get priority AI responses and deep analytics.`,
      `${displayName}, I can do so much more as your Business Buddy!`,
    ];
    
    const text = upgradeNudges[Math.floor(Math.random() * upgradeNudges.length)];
    const thought = this.createThought(text, 'ADVISING', 'upgrade_nudge', 'normal');
    thought.ctaText = 'View Plans';
    thought.ctaLink = '/subscription';
    
    this.queueThought(thought);
    this.state.lastUpgradeNudgeAt = now;
  }
  
  /**
   * Trigger a subtle upgrade hint (less aggressive than nudge)
   * Shown when user tries to access a premium feature
   */
  triggerUpgradeHint(featureName: string): void {
    if (this.state.businessBuddyTier === 'BUSINESS_BUDDY') {
      return;
    }
    
    const hints = [
      `"${featureName}" is a Business Buddy feature. Want to unlock it?`,
      `That's a premium feature! Business Buddy subscribers can use ${featureName}.`,
      `${featureName} requires Business Buddy. Upgrade to access!`,
    ];
    
    const text = hints[Math.floor(Math.random() * hints.length)];
    const thought = this.createThought(text, 'ADVISING', 'upgrade_hint', 'high');
    thought.ctaText = 'Learn More';
    thought.ctaLink = '/subscription';
    
    this.showThought(thought);
  }
  
  // ============================================================================
  // DIAGNOSTIC MODE FOR SUPPORT ROLES
  // ============================================================================
  
  /**
   * Check if current user is in diagnostic mode (support/root roles)
   */
  isDiagnosticMode(): boolean {
    const ctx = this.state.trinityContext;
    return ctx?.isRootAdmin || ctx?.isPlatformStaff || ctx?.isSupportRole || false;
  }
  
  /**
   * Trigger a diagnostic alert for platform issues
   * Only visible to support/root roles
   */
  triggerDiagnosticAlert(issue: {
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    description: string;
    suggestedAction?: string;
    actionLink?: string;
  }): void {
    // Only show to support/root roles
    if (!this.isDiagnosticMode()) {
      return;
    }
    
    const displayName = this.getUserDisplayName();
    const severityEmoji = {
      info: 'Info',
      warning: 'Warning',
      error: 'Error',
      critical: 'Critical'
    }[issue.severity];
    
    const priority: 'low' | 'normal' | 'high' | 'urgent' = 
      issue.severity === 'critical' ? 'urgent' :
      issue.severity === 'error' ? 'high' :
      issue.severity === 'warning' ? 'normal' : 'low';
    
    const text = `${severityEmoji}: ${issue.title}. ${issue.description}`;
    const thought = this.createThought(text, 'ANALYZING', 'ai', priority);
    
    if (issue.suggestedAction) {
      thought.ctaText = issue.suggestedAction;
      thought.ctaLink = issue.actionLink || '/support-console';
    }
    
    this.queueThought(thought);
  }
  
  /**
   * Trigger a hotfix suggestion for support roles
   * Displays the suggested fix with one-click action
   */
  triggerHotfixSuggestion(suggestion: {
    id: string;
    title: string;
    description: string;
    actionCode: string;
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
  }): void {
    // Only show to support/root roles
    if (!this.isDiagnosticMode()) {
      return;
    }
    
    const displayName = this.getUserDisplayName();
    const riskLabel = suggestion.riskLevel === 'high' ? 'High risk' : 
                      suggestion.riskLevel === 'medium' ? 'Medium risk' : 'Low risk';
    
    const confidencePercent = Math.round(suggestion.confidence * 100);
    
    const text = `${displayName}, I detected an issue and have a suggested fix: "${suggestion.title}" (${confidencePercent}% confidence, ${riskLabel}). Want me to apply it?`;
    const thought = this.createThought(text, 'ANALYZING', 'ai', 'high');
    thought.ctaText = 'View Fix';
    thought.ctaLink = `/support-console?tab=fixes&highlight=${suggestion.id}`;
    
    this.showThought(thought);
  }
  
  /**
   * Trigger platform health status update for support roles
   */
  triggerPlatformHealthUpdate(status: 'healthy' | 'degraded' | 'critical', message: string): void {
    // Only show to support/root roles
    if (!this.isDiagnosticMode()) {
      return;
    }
    
    const displayName = this.getUserDisplayName();
    
    let text: string;
    let priority: 'low' | 'normal' | 'high' | 'urgent';
    
    if (status === 'healthy') {
      text = `${displayName}, all platform systems are running smoothly. No issues detected.`;
      priority = 'low';
    } else if (status === 'degraded') {
      text = `${displayName}, platform performance is degraded: ${message}. Monitoring closely.`;
      priority = 'normal';
    } else {
      text = `${displayName}, critical platform issue detected: ${message}. Immediate attention required!`;
      priority = 'urgent';
    }
    
    const thought = this.createThought(text, 'ANALYZING', 'ai', priority);
    thought.ctaText = 'View Health';
    thought.ctaLink = '/support-console?tab=orchestration';
    
    if (status === 'critical') {
      this.showThought(thought);
    } else {
      this.queueThought(thought);
    }
  }
  
  /**
   * Trigger workflow issue detection notification
   */
  triggerWorkflowIssue(workflowId: string, workflowName: string, issue: string): void {
    if (!this.isDiagnosticMode()) {
      return;
    }
    
    const displayName = this.getUserDisplayName();
    const text = `${displayName}, workflow "${workflowName}" has an issue: ${issue}. I can suggest fixes.`;
    const thought = this.createThought(text, 'ANALYZING', 'ai', 'high');
    thought.ctaText = 'Investigate';
    thought.ctaLink = `/support-console?tab=fixes&workflow=${workflowId}`;
    
    this.queueThought(thought);
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
    
    // Standard fallback greetings - professional business tone
    const standardGreetings = [
      `${timeGreeting}, ${displayName}. I'm Trinity, your AI assistant. How may I help you today?`,
      `${timeGreeting}, ${displayName}. Ready to assist with your workflow.`,
      `Welcome back, ${displayName}. What can I help you accomplish today?`,
      `${timeGreeting}, ${displayName}. Your AI assistant is ready.`,
    ];
    
    let greeting: string;
    
    // If no context, use standard greeting
    if (!ctx) {
      greeting = standardGreetings[Math.floor(Math.random() * standardGreetings.length)];
    }
    // Root admin persona - executive professional tone
    else if (ctx.isRootAdmin) {
      const rootGreetings = [
        `${timeGreeting}, ${displayName}. Platform systems nominal. Executive dashboard ready.`,
        `Welcome back, ${displayName}. All services operational. Standing by for your directives.`,
        `${timeGreeting}, ${displayName}. Administrative access confirmed. What would you like to review?`,
        `${timeGreeting}, ${displayName}. Platform health optimal. Ready for executive operations.`,
      ];
      greeting = rootGreetings[Math.floor(Math.random() * rootGreetings.length)];
    }
    // Support role persona - professional support tone
    else if (ctx.isSupportRole) {
      const supportGreetings = [
        `${timeGreeting}, ${displayName}. Support console initialized. How can I assist?`,
        `${timeGreeting}, ${displayName}. Support systems ready. Standing by for ticket review.`,
        `Welcome, ${displayName}. Support dashboard synchronized. Ready to help users.`,
        `${timeGreeting}, ${displayName}. Customer support mode active. How can I help?`,
      ];
      greeting = supportGreetings[Math.floor(Math.random() * supportGreetings.length)];
    }
    // Other platform staff persona
    else if (ctx.isPlatformStaff) {
      const staffGreetings = [
        `${timeGreeting}, ${displayName}. Platform staff access confirmed.`,
        `${timeGreeting}, ${displayName}. Ready to assist with platform operations.`,
        `Welcome, ${displayName}. Full platform access enabled.`,
      ];
      greeting = staffGreetings[Math.floor(Math.random() * staffGreetings.length)];
    }
    // Trinity Pro users - executive advisor tone
    else if (ctx.hasTrinityPro) {
      const proGreetings = [
        `${timeGreeting}, ${displayName}. Trinity Pro activated. Your AI advisor is ready.`,
        `${timeGreeting}, ${displayName}. Priority support access enabled. How can I assist?`,
        `Welcome back, ${displayName}. Ready to provide strategic insights and recommendations.`,
        `${timeGreeting}, ${displayName}. Trinity Pro features at your service.`,
      ];
      greeting = proGreetings[Math.floor(Math.random() * proGreetings.length)];
    }
    // Organization owner / Business Buddy persona - business professional tone
    else if (ctx.isOrgOwner || ctx.hasBusinessBuddy || ctx.persona === 'business_buddy') {
      const ownerGreetings = [
        `${timeGreeting}, ${displayName}. Your business intelligence dashboard is ready.`,
        `${timeGreeting}, ${displayName}. Ready to assist with workforce optimization.`,
        `Welcome back, ${displayName}. How can I help with your organization today?`,
        `${timeGreeting}, ${displayName}. Standing by to support your business operations.`,
      ];
      greeting = ownerGreetings[Math.floor(Math.random() * ownerGreetings.length)];
    }
    // New org / onboarding persona - helpful professional guide
    else if (ctx.persona === 'onboarding_guide' || ctx.orgStats?.isNewOrg) {
      const onboardingGreetings = [
        `${timeGreeting}, ${displayName}. I'm Trinity, your onboarding guide. Let me walk you through the setup.`,
        `Welcome, ${displayName}. I'll help you configure your platform step by step.`,
        `${timeGreeting}, ${displayName}. Ready to help you get started with the platform.`,
      ];
      greeting = onboardingGreetings[Math.floor(Math.random() * onboardingGreetings.length)];
    }
    // Manager persona - team management professional
    else if (ctx.isManager) {
      const managerGreetings = [
        `${timeGreeting}, ${displayName}. Team management tools are ready.`,
        `${timeGreeting}, ${displayName}. Ready to assist with schedule coordination.`,
        `Welcome, ${displayName}. Your team status and schedule are updated.`,
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
      greeting = `Hello, ${displayName}. I'm Trinity, ready to assist.`;
    }
    
    const thought = this.createThought(greeting, 'GREETING' as MascotMode, 'default', 'high');
    // Route through queueThought to honor warmup gate
    this.queueThought(thought);
    
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
   * Ingest automation event for Trinity awareness
   * Called by WebSocket subscription when automation jobs complete
   */
  ingestAutomationEvent(event: {
    id: string;
    type: string;
    status: 'started' | 'completed' | 'failed';
    jobType: string;
    duration?: number;
    result?: { message?: string; itemsProcessed?: number };
    error?: string;
  }): void {
    const displayName = this.getUserDisplayName();
    
    if (event.status === 'completed') {
      const messages = [
        `Automation job "${event.jobType}" completed! ${event.result?.itemsProcessed || 0} items processed.`,
        `${displayName}, your ${event.jobType} task just finished successfully!`,
        `Done! ${event.jobType} automation completed in ${event.duration ? Math.round(event.duration / 1000) + 's' : 'record time'}!`,
      ];
      const text = messages[Math.floor(Math.random() * messages.length)];
      const thought = this.createThought(text, 'HAPPY' as MascotMode, 'ai', 'normal');
      this.queueThought(thought);
    } else if (event.status === 'failed') {
      const text = `${displayName}, ${event.jobType} automation hit a snag: ${event.error || 'Unknown error'}. I'll help you fix it!`;
      const thought = this.createThought(text, 'WARNING' as MascotMode, 'ai', 'high');
      this.showThought(thought);
    }
  }
  
  /**
   * Ingest FAST mode execution results for SLA tracking
   */
  ingestFastModeResult(result: {
    tier: 'fast' | 'turbo' | 'instant';
    duration: number;
    slaTarget: number;
    success: boolean;
    agentCount: number;
    creditsCost: number;
    qualityScore?: number;
  }): void {
    const displayName = this.getUserDisplayName();
    const slaPercent = Math.round((result.slaTarget / result.duration) * 100);
    
    if (result.success && result.duration <= result.slaTarget) {
      const celebs = [
        `${displayName}, FAST mode delivered in ${Math.round(result.duration / 1000)}s (${slaPercent}% of SLA)! ${result.agentCount} agents crushed it.`,
        `Lightning fast! ${result.tier.toUpperCase()} completed under SLA. Quality score: ${result.qualityScore || 'A+'}`,
        `FAST mode win: ${result.agentCount} agents, ${result.creditsCost} credits, ${Math.round(result.duration / 1000)}s. Nailed it!`,
      ];
      const text = celebs[Math.floor(Math.random() * celebs.length)];
      const thought = this.createThought(text, 'HAPPY' as MascotMode, 'ai', 'high');
      this.showThought(thought);
    } else if (!result.success || result.duration > result.slaTarget) {
      const refundPercent = result.duration > result.slaTarget * 2 ? 100 : result.duration > result.slaTarget * 1.5 ? 50 : 25;
      const text = `FAST mode ${result.tier} took longer than expected. ${refundPercent}% credit refund applied. Let's optimize next time!`;
      const thought = this.createThought(text, 'ADVISING', 'ai', 'normal');
      this.queueThought(thought);
    }
  }
  
  /**
   * Ingest priority insights from org intelligence
   * Called when TrinityContext provides new business metrics
   */
  ingestOrgInsights(insights: string[]): void {
    if (!insights || insights.length === 0) return;
    
    for (const insight of insights.slice(0, 3)) {
      const thought = this.createThought(insight, 'ADVISING', 'ai', 'high');
      this.queueThought(thought);
    }
  }
  
  /**
   * Ingest automation graduation milestone
   */
  ingestGraduationMilestone(milestone: {
    from: 'hand_held' | 'graduated' | 'full_automation';
    to: 'hand_held' | 'graduated' | 'full_automation';
    confidenceScore: number;
    unlockedFeatures: string[];
  }): void {
    const displayName = this.getUserDisplayName();
    const levelNames: Record<string, string> = {
      'hand_held': 'Hand-Held',
      'graduated': 'Graduated',
      'full_automation': 'Full Automation',
    };
    
    const celebrations = [
      `${displayName}, CONGRATS! Your org graduated to ${levelNames[milestone.to]}! Confidence: ${milestone.confidenceScore}%`,
      `Milestone unlocked! ${levelNames[milestone.to]} mode activated. ${milestone.unlockedFeatures.length} new features available!`,
      `Your team earned ${levelNames[milestone.to]} status! Trust score: ${milestone.confidenceScore}%. Well done!`,
    ];
    
    const text = celebrations[Math.floor(Math.random() * celebrations.length)];
    const thought = this.createThought(text, 'HAPPY' as MascotMode, 'ai', 'urgent');
    this.showThought(thought);
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
    if (this.rotationStartupTimer) {
      clearTimeout(this.rotationStartupTimer);
      this.rotationStartupTimer = null;
    }
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
