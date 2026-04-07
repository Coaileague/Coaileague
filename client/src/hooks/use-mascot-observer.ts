/**
 * useMascotObserver - AI-powered user action observation system
 * 
 * Features:
 * - Watches user actions and page context in real-time
 * - Triggers contextual AI advice based on user behavior
 * - Fires unique splash animations for different insight types
 * - Learns from user patterns to offer proactive guidance
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { userActionTracker, type ActionEvent, type UserAction } from '@/lib/mascot/UserActionTracker';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import { emotesManager, type EmoteCategory } from '@/lib/mascot/EmotesLibrary';
import { useLocation } from 'wouter';

export type InsightType = 
  | 'tip'
  | 'encouragement'
  | 'warning'
  | 'celebration'
  | 'guidance'
  | 'discovery'
  | 'productivity';

export type SplashAnimation = 
  | 'sparkle_burst'
  | 'confetti_shower'
  | 'star_spiral'
  | 'wave_ripple'
  | 'energy_pulse'
  | 'rainbow_arc'
  | 'lightning_flash'
  | 'heart_float'
  | 'bubble_pop'
  | 'fire_burst'
  | 'ice_crystals'
  | 'leaf_scatter';

interface ContextualInsight {
  type: InsightType;
  message: string;
  splash: SplashAnimation;
  priority: 'low' | 'normal' | 'high';
}

interface PageContext {
  path: string;
  category: string;
  actions: string[];
}

const PAGE_CONTEXTS: Record<string, PageContext> = {
  '/schedule': { path: '/schedule', category: 'scheduling', actions: ['create_shift', 'edit_shift', 'swap_shift'] },
  '/employees': { path: '/employees', category: 'team', actions: ['add_employee', 'edit_profile', 'view_team'] },
  '/timesheet': { path: '/timesheet', category: 'time_tracking', actions: ['clock_in', 'clock_out', 'review_hours'] },
  '/invoices': { path: '/invoices', category: 'billing', actions: ['create_invoice', 'send_invoice', 'view_payments'] },
  '/analytics': { path: '/analytics', category: 'insights', actions: ['view_metrics', 'export_report', 'analyze_trends'] },
  '/settings': { path: '/settings', category: 'configuration', actions: ['update_profile', 'change_settings', 'manage_integrations'] },
  '/dashboard': { path: '/dashboard', category: 'overview', actions: ['review_status', 'quick_actions', 'notifications'] },
  '/chat': { path: '/chat', category: 'communication', actions: ['send_message', 'create_chat', 'support_request'] },
  '/chatrooms': { path: '/chatrooms', category: 'communication', actions: ['send_message', 'create_chat', 'support_request'] },
};

const CONTEXTUAL_INSIGHTS: Record<string, ContextualInsight[]> = {
  scheduling: [
    { type: 'tip', message: 'Try one-click duplication to copy shifts faster!', splash: 'sparkle_burst', priority: 'normal' },
    { type: 'guidance', message: 'Check employee availability before assigning shifts', splash: 'star_spiral', priority: 'low' },
    { type: 'productivity', message: 'Use templates to create recurring schedules in seconds', splash: 'energy_pulse', priority: 'normal' },
  ],
  team: [
    { type: 'encouragement', message: 'Great team management leads to happier employees!', splash: 'heart_float', priority: 'low' },
    { type: 'tip', message: 'Add skills to employee profiles for smarter scheduling', splash: 'sparkle_burst', priority: 'normal' },
    { type: 'discovery', message: 'Did you know? You can set availability patterns here!', splash: 'rainbow_arc', priority: 'low' },
  ],
  time_tracking: [
    { type: 'tip', message: 'Timesheets auto-calculate overtime - just review and approve!', splash: 'sparkle_burst', priority: 'normal' },
    { type: 'productivity', message: 'Export timesheets directly to payroll with one click', splash: 'energy_pulse', priority: 'normal' },
    { type: 'guidance', message: 'Anomaly detection flags unusual clock patterns automatically', splash: 'star_spiral', priority: 'low' },
  ],
  billing: [
    { type: 'tip', message: 'Link timesheets to invoices for automatic hour calculation', splash: 'sparkle_burst', priority: 'normal' },
    { type: 'celebration', message: 'Nice work on that invoice!', splash: 'confetti_shower', priority: 'low' },
    { type: 'productivity', message: 'Set up recurring invoices for regular clients', splash: 'energy_pulse', priority: 'normal' },
  ],
  insights: [
    { type: 'discovery', message: 'AI-powered insights can predict staffing needs!', splash: 'rainbow_arc', priority: 'normal' },
    { type: 'tip', message: 'Heat maps show your busiest times at a glance', splash: 'sparkle_burst', priority: 'low' },
    { type: 'productivity', message: 'Schedule reports to be emailed automatically', splash: 'energy_pulse', priority: 'normal' },
  ],
  configuration: [
    { type: 'tip', message: 'Connect your calendar for automatic sync!', splash: 'sparkle_burst', priority: 'normal' },
    { type: 'guidance', message: 'Enable SMS notifications for real-time alerts', splash: 'star_spiral', priority: 'normal' },
    { type: 'discovery', message: 'Custom branding options available in workspace settings', splash: 'rainbow_arc', priority: 'low' },
  ],
  overview: [
    { type: 'encouragement', message: 'Your dashboard is looking great today!', splash: 'heart_float', priority: 'low' },
    { type: 'tip', message: 'Customize widgets to see what matters most to you', splash: 'sparkle_burst', priority: 'normal' },
    { type: 'productivity', message: 'Quick actions save you clicks - try them out!', splash: 'energy_pulse', priority: 'low' },
  ],
  communication: [
    { type: 'tip', message: 'Use @mentions to notify specific team members', splash: 'sparkle_burst', priority: 'low' },
    { type: 'encouragement', message: 'Great communication builds great teams!', splash: 'heart_float', priority: 'low' },
    { type: 'guidance', message: 'HelpAI can answer questions about the platform', splash: 'star_spiral', priority: 'normal' },
  ],
};

const ACTION_CELEBRATIONS: Record<UserAction, ContextualInsight | null> = {
  form_submit: { type: 'celebration', message: 'Submitted! Well done!', splash: 'confetti_shower', priority: 'high' },
  success: { type: 'celebration', message: 'Success! Keep up the great work!', splash: 'star_spiral', priority: 'normal' },
  error: { type: 'encouragement', message: 'No worries, let me help you fix that!', splash: 'wave_ripple', priority: 'high' },
  idle_long: { type: 'encouragement', message: 'Still here? Let me know if you need help!', splash: 'heart_float', priority: 'low' },
  navigate: null,
  click: null,
  typing: null,
  typing_fast: { type: 'encouragement', message: 'Wow, you type fast!', splash: 'lightning_flash', priority: 'low' },
  typing_stop: null,
  scroll: null,
  scroll_fast: null,
  scroll_stop: null,
  hover: null,
  focus: null,
  blur: null,
  form_start: null,
  loading_start: null,
  loading_end: null,
  idle: null,
  tab_visible: { type: 'encouragement', message: 'Welcome back! Ready to be productive?', splash: 'sparkle_burst', priority: 'normal' },
  tab_hidden: null,
};

const SPLASH_EMOTE_CATEGORIES: Record<SplashAnimation, EmoteCategory> = {
  sparkle_burst: 'excited',
  confetti_shower: 'celebration',
  star_spiral: 'proud',
  wave_ripple: 'helpful',
  energy_pulse: 'playful',
  rainbow_arc: 'curious',
  lightning_flash: 'excited',
  heart_float: 'greeting',
  bubble_pop: 'playful',
  fire_burst: 'excited',
  ice_crystals: 'curious',
  leaf_scatter: 'idle',
};

interface ObserverState {
  lastInsightTime: number;
  insightCount: number;
  pageVisitDuration: number;
  actionsOnPage: number;
  lastPagePath: string;
}

const INSIGHT_COOLDOWN_MS = 45000;
const PAGE_INSIGHT_DELAY_MS = 8000;
const MAX_INSIGHTS_PER_PAGE = 3;

export function useMascotObserver(enabled: boolean = true) {
  const [location] = useLocation();
  const stateRef = useRef<ObserverState>({
    lastInsightTime: 0,
    insightCount: 0,
    pageVisitDuration: 0,
    actionsOnPage: 0,
    lastPagePath: '',
  });
  const pageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentSplash, setCurrentSplash] = useState<SplashAnimation | null>(null);

  const triggerSplashAnimation = useCallback((splash: SplashAnimation) => {
    setCurrentSplash(splash);
    
    const emoteCategory = SPLASH_EMOTE_CATEGORIES[splash];
    if (emoteCategory) {
      emotesManager.triggerByCategory(emoteCategory);
    }
    
    setTimeout(() => setCurrentSplash(null), 2000);
  }, []);

  const triggerInsight = useCallback((insight: ContextualInsight) => {
    const now = Date.now();
    const state = stateRef.current;
    
    if (now - state.lastInsightTime < INSIGHT_COOLDOWN_MS) {
      return;
    }
    
    if (state.insightCount >= MAX_INSIGHTS_PER_PAGE) {
      return;
    }
    
    state.lastInsightTime = now;
    state.insightCount++;
    
    thoughtManager.triggerAIInsight(insight.message, insight.priority);
    triggerSplashAnimation(insight.splash);
  }, [triggerSplashAnimation]);

  const getPageContext = useCallback((path: string): PageContext | null => {
    for (const [key, context] of Object.entries(PAGE_CONTEXTS)) {
      if (path.startsWith(key)) {
        return context;
      }
    }
    return null;
  }, []);

  const selectRandomInsight = useCallback((category: string): ContextualInsight | null => {
    const insights = CONTEXTUAL_INSIGHTS[category];
    if (!insights || insights.length === 0) return null;
    
    return insights[Math.floor(Math.random() * insights.length)];
  }, []);

  const handleActionEvent = useCallback((event: ActionEvent) => {
    const state = stateRef.current;
    state.actionsOnPage++;
    
    const celebration = ACTION_CELEBRATIONS[event.action];
    if (celebration && Math.random() > 0.7) {
      triggerInsight(celebration);
    }
  }, [triggerInsight]);

  useEffect(() => {
    if (!enabled) return;
    
    const state = stateRef.current;
    
    if (location !== state.lastPagePath) {
      state.lastPagePath = location;
      state.insightCount = 0;
      state.actionsOnPage = 0;
      state.pageVisitDuration = Date.now();
      
      if (pageTimerRef.current) {
        clearTimeout(pageTimerRef.current);
      }
      
      const context = getPageContext(location);
      if (context) {
        pageTimerRef.current = setTimeout(() => {
          const insight = selectRandomInsight(context.category);
          if (insight && Math.random() > 0.5) {
            triggerInsight(insight);
          }
        }, PAGE_INSIGHT_DELAY_MS);
      }
    }
    
    return () => {
      if (pageTimerRef.current) {
        clearTimeout(pageTimerRef.current);
      }
    };
  }, [location, enabled, getPageContext, selectRandomInsight, triggerInsight]);

  useEffect(() => {
    if (!enabled) return;
    
    const unsubscribe = userActionTracker.subscribe(handleActionEvent);
    
    return unsubscribe;
  }, [enabled, handleActionEvent]);

  return {
    currentSplash,
    triggerSplash: triggerSplashAnimation,
    triggerCustomInsight: useCallback((message: string, type: InsightType = 'tip') => {
      const splashMap: Record<InsightType, SplashAnimation> = {
        tip: 'sparkle_burst',
        encouragement: 'heart_float',
        warning: 'wave_ripple',
        celebration: 'confetti_shower',
        guidance: 'star_spiral',
        discovery: 'rainbow_arc',
        productivity: 'energy_pulse',
      };
      
      triggerInsight({
        type,
        message,
        splash: splashMap[type],
        priority: 'normal',
      });
    }, [triggerInsight]),
  };
}

export default useMascotObserver;
