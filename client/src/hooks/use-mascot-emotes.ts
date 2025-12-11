/**
 * useMascotEmotes - Emote management hook for Trinity AI mascot
 * 
 * Manages emote state, triggers, and transitions based on:
 * - User navigation
 * - Time of day
 * - User interactions (tap, drag)
 * - AI responses
 * - Task completions
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { 
  EmoteType, 
  EMOTE_CONFIGS, 
  EMOTE_CONTEXTS,
  getRandomEmoteVariation,
  type EmoteConfig 
} from '@/config/mascotConfig';

interface EmoteState {
  current: EmoteType;
  previous: EmoteType;
  config: EmoteConfig;
  startTime: number;
  isTransitioning: boolean;
}

interface EmoteManager {
  emote: EmoteType;
  config: EmoteConfig;
  triggerEmote: (emote: EmoteType, force?: boolean) => void;
  triggerByContext: (trigger: string) => void;
  isTransitioning: boolean;
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function findEmoteForContext(trigger: string, path?: string): EmoteType | null {
  const timeOfDay = getTimeOfDay();
  
  // Find matching contexts sorted by priority
  const matches = EMOTE_CONTEXTS
    .filter(ctx => {
      if (ctx.trigger !== trigger) return false;
      
      // Check time condition
      if (ctx.conditions?.timeOfDay && ctx.conditions.timeOfDay !== timeOfDay) {
        return false;
      }
      
      // Check page pattern
      if (ctx.conditions?.pagePattern && path) {
        if (!path.includes(ctx.conditions.pagePattern)) {
          return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
  
  return matches.length > 0 ? matches[0].emote : null;
}

export function useMascotEmotes(): EmoteManager {
  const [location] = useLocation();
  const [state, setState] = useState<EmoteState>({
    current: 'neutral',
    previous: 'neutral',
    config: EMOTE_CONFIGS.neutral,
    startTime: Date.now(),
    isTransitioning: false,
  });
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef(location);
  // Use ref to track current emote without causing callback recreation
  const currentEmoteRef = useRef(state.current);
  currentEmoteRef.current = state.current;
  
  // Trigger a specific emote - stable callback that uses ref for current state
  // Uses random variation for personality and unpredictability
  const triggerEmote = useCallback((emote: EmoteType, force = false) => {
    if (emote === currentEmoteRef.current && !force) return;
    
    // Get a random variation for this emote type
    const config = getRandomEmoteVariation(emote);
    
    setState(prev => ({
      current: emote,
      previous: prev.current,
      config,
      startTime: Date.now(),
      isTransitioning: true,
    }));
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Set transition end
    setTimeout(() => {
      setState(prev => ({ ...prev, isTransitioning: false }));
    }, 200);
    
    // Auto-revert to neutral after duration (if not indefinite)
    if (config.duration > 0) {
      timeoutRef.current = setTimeout(() => {
        setState(prev => ({
          current: 'neutral',
          previous: prev.current,
          config: EMOTE_CONFIGS.neutral,
          startTime: Date.now(),
          isTransitioning: true,
        }));
        
        setTimeout(() => {
          setState(prev => ({ ...prev, isTransitioning: false }));
        }, 200);
      }, config.duration);
    }
  }, []); // Empty deps - uses ref for current state
  
  // Trigger emote by context
  const triggerByContext = useCallback((trigger: string) => {
    const emote = findEmoteForContext(trigger, location);
    if (emote) {
      triggerEmote(emote);
    }
  }, [location, triggerEmote]);
  
  // Handle page navigation
  useEffect(() => {
    if (location !== lastLocationRef.current) {
      lastLocationRef.current = location;
      
      // Find page-specific emote
      let emote: EmoteType | null = null;
      
      if (location.includes('/dashboard')) {
        emote = findEmoteForContext('page_dashboard', location);
      } else if (location.includes('/analytics')) {
        emote = findEmoteForContext('page_analytics', location);
      } else if (location.includes('/schedule')) {
        emote = findEmoteForContext('page_schedule', location);
      } else if (location.includes('/payroll')) {
        emote = findEmoteForContext('page_payroll', location);
      } else if (location.includes('/settings')) {
        emote = findEmoteForContext('page_settings', location);
      } else {
        // Generic page change
        emote = findEmoteForContext('page_change', location);
      }
      
      if (emote) {
        triggerEmote(emote);
      }
    }
  }, [location, triggerEmote]);
  
  // Time-based emotes (check on mount and periodically)
  useEffect(() => {
    const checkTimeEmote = () => {
      const timeOfDay = getTimeOfDay();
      // Use ref to check current state without causing re-runs
      if (timeOfDay === 'night' && currentEmoteRef.current === 'neutral') {
        const emote = findEmoteForContext('time_night');
        if (emote) triggerEmote(emote);
      } else if (timeOfDay === 'morning' && currentEmoteRef.current === 'neutral') {
        const emote = findEmoteForContext('time_morning');
        if (emote) triggerEmote(emote);
      }
    };
    
    // Check on mount
    checkTimeEmote();
    
    // Check every 30 minutes
    const interval = setInterval(checkTimeEmote, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [triggerEmote]); // Removed state.current - now uses ref
  
  // PERIODIC RANDOM EMOTE AUTO-CYCLING
  // Triggers random ambient emotes every 20-40 seconds for liveliness
  useEffect(() => {
    const AMBIENT_EMOTES: EmoteType[] = [
      'curious', 'happy', 'thinking', 'helpful', 'nodding', 'waving', 'proud'
    ];
    
    const triggerRandomEmote = () => {
      // Only trigger if currently neutral and not transitioning
      if (currentEmoteRef.current === 'neutral' && !state.isTransitioning) {
        const randomEmote = AMBIENT_EMOTES[Math.floor(Math.random() * AMBIENT_EMOTES.length)];
        triggerEmote(randomEmote);
      }
    };
    
    // Initial delay of 5-10 seconds before first random emote
    const initialDelay = 5000 + Math.random() * 5000;
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;
    
    timeoutId = setTimeout(() => {
      triggerRandomEmote();
      
      // Then trigger every 25-45 seconds with jitter
      const scheduleNext = () => {
        const nextDelay = 25000 + Math.random() * 20000; // 25-45s
        intervalId = setTimeout(() => {
          triggerRandomEmote();
          scheduleNext();
        }, nextDelay);
      };
      scheduleNext();
    }, initialDelay);
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(intervalId);
    };
  }, [triggerEmote, state.isTransitioning]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return {
    emote: state.current,
    config: state.config,
    triggerEmote,
    triggerByContext,
    isTransitioning: state.isTransitioning,
  };
}

// Export singleton emote trigger for use outside React
let globalEmoteTrigger: ((trigger: string) => void) | null = null;

export function setGlobalEmoteTrigger(fn: (trigger: string) => void) {
  globalEmoteTrigger = fn;
}

export function triggerGlobalEmote(trigger: string) {
  if (globalEmoteTrigger) {
    globalEmoteTrigger(trigger);
  }
}
