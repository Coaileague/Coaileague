/**
 * useMascotShowcase - Public showcase mode for mascot animation capabilities
 * 
 * When user is NOT authenticated (on public pages), the mascot randomly cycles through:
 * - Different emotes (happy, excited, thinking, curious, etc.)
 * - Warp/mutation effects (chromatic aberration, glitch, scanlines)
 * - Transport effects (zap, dash, float, glide)
 * 
 * Shows off the mascot's full animation capabilities to visitors.
 * When user IS logged in, reduces frequency but still occasionally showcases.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmoteType } from '@/config/mascotConfig';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';

// Showcase effect types
type ShowcaseEffect = 'emote' | 'warp' | 'transport' | 'mutation' | 'chromatic' | 'glitch';

interface ShowcaseState {
  isShowcasing: boolean;
  currentEffect: ShowcaseEffect | null;
  emote: EmoteType | null;
  warpIntensity: number;
  chromaticAberration: boolean;
  glitchEffect: boolean;
}

// Emotes to showcase (ordered by visual impact)
const SHOWCASE_EMOTES: EmoteType[] = [
  'excited', 'happy', 'thinking', 'curious', 'surprised', 
  'celebrating', 'focused', 'neutral', 'sleepy', 'proud'
];

// Showcase thoughts for public visitors
const SHOWCASE_THOUGHTS = {
  emote: [
    "Watch me change expressions!",
    "I have many moods...",
    "See my personality shine!",
    "Expressive AI mascot!",
    "Feeling the vibes!",
  ],
  warp: [
    "Warping through dimensions...",
    "Reality bending!",
    "Mutation sequence initiated!",
    "Transforming...",
    "Energy surge!",
  ],
  chromatic: [
    "Chromatic shift active!",
    "Colors splitting...",
    "Prismatic mode!",
    "Light bending!",
    "RGB separation!",
  ],
  glitch: [
    "G̷l̷i̷t̷c̷h̷ m̷o̷d̷e̷!",
    "Reality corruption...",
    "System anomaly!",
    "Digital distortion!",
    "Matrix glitch!",
  ],
  transport: [
    "Teleporting!",
    "Zapping to new location!",
    "Dashing through!",
    "Floating freely!",
    "Gliding smoothly!",
  ],
};

// Pick random from array
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface ShowcaseControl {
  isShowcasing: boolean;
  currentEffect: ShowcaseEffect | null;
  emote: EmoteType | null;
  warpIntensity: number;
  chromaticAberration: boolean;
  glitchEffect: boolean;
  triggerShowcase: () => void;
  stopShowcase: () => void;
}

export function useMascotShowcase(
  triggerEmote: (emote: EmoteType, force?: boolean) => void,
  triggerRoam: () => void,
  isPublicPage: boolean,
  isAuthenticated: boolean
): ShowcaseControl {
  const [state, setState] = useState<ShowcaseState>({
    isShowcasing: false,
    currentEffect: null,
    emote: null,
    warpIntensity: 0,
    chromaticAberration: false,
    glitchEffect: false,
  });
  
  const showcaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShowcaseRef = useRef<number>(0);
  const isActiveRef = useRef(false);
  
  // Check if we should be in public showcase mode
  const shouldShowcase = isPublicPage && !isAuthenticated;
  
  // Reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  
  // Run a single showcase effect
  const runShowcaseEffect = useCallback(() => {
    if (prefersReducedMotion) return;
    
    // Pick random effect type (weighted towards emotes for smoother experience)
    const effectWeights: { effect: ShowcaseEffect; weight: number }[] = [
      { effect: 'emote', weight: 40 },
      { effect: 'warp', weight: 20 },
      { effect: 'chromatic', weight: 15 },
      { effect: 'glitch', weight: 10 },
      { effect: 'transport', weight: 15 },
    ];
    
    const totalWeight = effectWeights.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedEffect: ShowcaseEffect = 'emote';
    
    for (const { effect, weight } of effectWeights) {
      random -= weight;
      if (random <= 0) {
        selectedEffect = effect;
        break;
      }
    }
    
    // Execute the effect
    switch (selectedEffect) {
      case 'emote': {
        const emote = pickRandom(SHOWCASE_EMOTES);
        triggerEmote(emote, true);
        thoughtManager.triggerAIInsight(pickRandom(SHOWCASE_THOUGHTS.emote), 'normal');
        setState(prev => ({
          ...prev,
          isShowcasing: true,
          currentEffect: 'emote',
          emote,
        }));
        break;
      }
      
      case 'warp': {
        // Trigger warp/mutation effect
        const intensity = 0.5 + Math.random() * 0.5;
        thoughtManager.triggerAIInsight(pickRandom(SHOWCASE_THOUGHTS.warp), 'normal');
        setState(prev => ({
          ...prev,
          isShowcasing: true,
          currentEffect: 'warp',
          warpIntensity: intensity,
        }));
        // Also trigger an emote during warp
        triggerEmote(pickRandom(['excited', 'surprised', 'focused']), true);
        break;
      }
      
      case 'chromatic': {
        thoughtManager.triggerAIInsight(pickRandom(SHOWCASE_THOUGHTS.chromatic), 'normal');
        setState(prev => ({
          ...prev,
          isShowcasing: true,
          currentEffect: 'chromatic',
          chromaticAberration: true,
        }));
        triggerEmote('curious', true);
        break;
      }
      
      case 'glitch': {
        thoughtManager.triggerAIInsight(pickRandom(SHOWCASE_THOUGHTS.glitch), 'normal');
        setState(prev => ({
          ...prev,
          isShowcasing: true,
          currentEffect: 'glitch',
          glitchEffect: true,
        }));
        triggerEmote('surprised', true);
        break;
      }
      
      case 'transport': {
        thoughtManager.triggerAIInsight(pickRandom(SHOWCASE_THOUGHTS.transport), 'normal');
        // Trigger roaming with transport effect
        triggerRoam();
        setState(prev => ({
          ...prev,
          isShowcasing: true,
          currentEffect: 'transport',
        }));
        break;
      }
    }
    
    // Clear effect after duration
    effectTimerRef.current = setTimeout(() => {
      setState(prev => ({
        ...prev,
        isShowcasing: false,
        currentEffect: null,
        warpIntensity: 0,
        chromaticAberration: false,
        glitchEffect: false,
      }));
    }, 3000 + Math.random() * 2000);
    
  }, [triggerEmote, triggerRoam, prefersReducedMotion]);
  
  // Schedule next showcase
  const scheduleShowcase = useCallback(() => {
    if (!isActiveRef.current) return;
    
    // Public pages: 8-15 second intervals
    // Authenticated: 30-60 second intervals (occasional)
    const minDelay = shouldShowcase ? 8000 : 30000;
    const maxDelay = shouldShowcase ? 15000 : 60000;
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    
    showcaseTimerRef.current = setTimeout(() => {
      const now = Date.now();
      // Cooldown check
      if (now - lastShowcaseRef.current > 5000) {
        lastShowcaseRef.current = now;
        runShowcaseEffect();
      }
      scheduleShowcase();
    }, delay);
  }, [shouldShowcase, runShowcaseEffect]);
  
  // Start/stop showcase based on auth state
  useEffect(() => {
    if (prefersReducedMotion) return;
    
    // Always enable showcase, just different frequencies
    isActiveRef.current = true;
    
    // Initial delay before first showcase (shorter on public pages)
    const initialDelay = shouldShowcase ? 3000 : 10000;
    
    const initialTimer = setTimeout(() => {
      if (isActiveRef.current && shouldShowcase) {
        runShowcaseEffect();
      }
      scheduleShowcase();
    }, initialDelay);
    
    return () => {
      isActiveRef.current = false;
      clearTimeout(initialTimer);
      if (showcaseTimerRef.current) clearTimeout(showcaseTimerRef.current);
      if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
    };
  }, [shouldShowcase, scheduleShowcase, runShowcaseEffect, prefersReducedMotion]);
  
  // Manual trigger
  const triggerShowcase = useCallback(() => {
    if (!prefersReducedMotion) {
      runShowcaseEffect();
    }
  }, [runShowcaseEffect, prefersReducedMotion]);
  
  // Stop showcase
  const stopShowcase = useCallback(() => {
    if (effectTimerRef.current) clearTimeout(effectTimerRef.current);
    setState({
      isShowcasing: false,
      currentEffect: null,
      emote: null,
      warpIntensity: 0,
      chromaticAberration: false,
      glitchEffect: false,
    });
  }, []);
  
  return {
    ...state,
    triggerShowcase,
    stopShowcase,
  };
}

export default useMascotShowcase;
