/**
 * FloatingMascot - Transparent, freely-roaming AI companion
 * 
 * Features:
 * - No background/border - truly floating twin stars
 * - Smart UI avoidance system
 * - User action reactive animations
 * - Smooth roaming with physics-based movement
 * - Rich emote expressions
 * - Thought bubbles with AI insights
 * - DPR-aware crisp rendering on mobile
 * - Adaptive quality tiers for performance
 * - Touch haptic feedback
 */

import { useEffect, useRef, useCallback, useState, memo, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { uiAvoidanceSystem, type MascotPosition } from '@/lib/mascot/UIAvoidanceSystem';
import { userActionTracker, type ActionEvent } from '@/lib/mascot/UserActionTracker';
import { emotesManager, type Emote, EMOTE_ANIMATIONS } from '@/lib/mascot/EmotesLibrary';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';
import { 
  MASCOT_CONFIG, 
  getDeviceSizes, 
  QUALITY_TIERS, 
  PERFORMANCE_CONFIG, 
  TOUCH_FEEDBACK_CONFIG,
  TRINITY_STAR_CONFIG,
  EMOTE_PHASE_CONFIGS,
  getEmotePhaseConfig,
  detectInitialQualityTier,
  type QualityTier,
  type QualitySettings,
  type EmotePhase 
} from '@/config/mascotConfig';
import { TrinityPhysics, MotionPattern, MOTION_PATTERNS } from '@/lib/mascot/TrinityPhysics';
import { StatusEmoteEffects, STATUS_COLORS } from '@/lib/mascot/StatusEmoteEffects';
import { useSeasonalTheme } from '@/context/SeasonalThemeContext';
import { useQuery } from '@tanstack/react-query';

// Performance monitoring for adaptive quality
interface PerformanceMetrics {
  frameTimes: number[];
  avgFPS: number;
  lastMeasurement: number;
  isIdle: boolean;
  idleStartTime: number | null;
}

// Haptic feedback helper
function triggerHaptic(duration: number = TOUCH_FEEDBACK_CONFIG.hapticDuration) {
  if (TOUCH_FEEDBACK_CONFIG.enableHaptic && 'vibrate' in navigator) {
    try {
      navigator.vibrate(duration);
    } catch (e) {
      // Haptic not available - silently fail
    }
  }
}

// Holiday directive response type
interface HolidayDirectiveResponse {
  success: boolean;
  seasonId: string;
  holidayDecor: {
    id: string;
    holidayKey: string;
    holidayName: string;
    starDecorations: Record<string, { attachments: string[]; glowPalette: string[]; ledCount?: number; ledSpeed?: number }>;
    globalGlowIntensity: number;
    isActive: boolean;
  } | null;
  motionProfile: {
    id: string;
    name: string;
    patternType: string;
    starMotion: Record<string, any>;
    physicsOverrides: Record<string, number> | null;
  } | null;
  latestDirective: any | null;
}

// Holiday decoration types for Trinity stars
interface StarDecoration {
  type: 'led_wrap' | 'santa_hat' | 'ornament' | 'star_topper';
  colors?: string[];
  ledCount?: number;
  ledSpeed?: number;
}

// Christmas LED colors
const CHRISTMAS_LED_COLORS = ['#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];

// Draw animated LED lights wrapped around a star
function drawLEDWrap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  time: number,
  colors: string[] = CHRISTMAS_LED_COLORS,
  ledCount: number = 8,
  speed: number = 0.5
) {
  const ledRadius = radius * 0.08;
  const wrapRadius = radius * 1.3;
  
  for (let i = 0; i < ledCount; i++) {
    const angle = (i / ledCount) * Math.PI * 2 + time * speed;
    const ledX = x + Math.cos(angle) * wrapRadius;
    const ledY = y + Math.sin(angle) * wrapRadius;
    
    // Pulsing glow effect
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.5);
    const color = colors[i % colors.length];
    
    // Outer glow
    const glowGradient = ctx.createRadialGradient(ledX, ledY, 0, ledX, ledY, ledRadius * 3);
    glowGradient.addColorStop(0, color + '80');
    glowGradient.addColorStop(0.5, color + '30');
    glowGradient.addColorStop(1, 'transparent');
    
    ctx.beginPath();
    ctx.arc(ledX, ledY, ledRadius * 3 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();
    
    // LED bulb
    ctx.beginPath();
    ctx.arc(ledX, ledY, ledRadius * (0.8 + pulse * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Highlight
    ctx.beginPath();
    ctx.arc(ledX - ledRadius * 0.2, ledY - ledRadius * 0.2, ledRadius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fill();
  }
  
  // NO wire connecting LEDs - just the dots themselves
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
  | 'ERROR'
  | 'CELEBRATING'
  | 'ADVISING'
  | 'HOLIDAY';

interface FloatingMascotProps {
  mode?: MascotMode;
  initialPosition?: MascotPosition;
  onPositionChange?: (pos: MascotPosition) => void;
  onModeChange?: (mode: MascotMode) => void;
  disabled?: boolean;
  userId?: string;
}

// Trinity color system: Cyan (Co), Purple (AI), Gold (L) - spells "CoAIL"
const MODE_COLORS: Record<MascotMode, { primary: string; secondary: string; tertiary: string; glow: string }> = {
  IDLE: { primary: '#38bdf8', secondary: '#a855f7', tertiary: '#f4c15d', glow: 'rgba(56, 189, 248, 0.6)' },
  SEARCHING: { primary: '#10b981', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(16, 185, 129, 0.6)' },
  THINKING: { primary: '#a855f7', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(168, 85, 247, 0.6)' },
  ANALYZING: { primary: '#6366f1', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(99, 102, 241, 0.6)' },
  CODING: { primary: '#34d399', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(52, 211, 153, 0.6)' },
  LISTENING: { primary: '#fbbf24', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(251, 191, 36, 0.6)' },
  UPLOADING: { primary: '#06b6d4', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(6, 182, 212, 0.6)' },
  SUCCESS: { primary: '#f472b6', secondary: '#ffffff', tertiary: '#fbbf24', glow: 'rgba(244, 114, 182, 0.6)' },
  ERROR: { primary: '#ef4444', secondary: '#ef4444', tertiary: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)' },
  CELEBRATING: { primary: '#38bdf8', secondary: '#a855f7', tertiary: '#fbbf24', glow: 'rgba(251, 191, 36, 0.6)' },
  ADVISING: { primary: '#10b981', secondary: '#ffffff', tertiary: '#f4c15d', glow: 'rgba(16, 185, 129, 0.6)' },
  HOLIDAY: { primary: '#38bdf8', secondary: '#a855f7', tertiary: '#f4c15d', glow: 'rgba(244, 114, 182, 0.6)' }
};

interface Twin {
  x: number;
  y: number;
  angle: number;
  color: string;
  trail: { x: number; y: number; opacity: number }[];
}

// Text animation variants for thought bubbles - gives alive human feel
type TextAnimationType = 'typewriter' | 'fadeIn' | 'slideUp' | 'pop' | 'wave';

const AnimatedText = memo(function AnimatedText({ text }: { text: string }) {
  const [displayedChars, setDisplayedChars] = useState<string[]>([]);
  const [animationType] = useState<TextAnimationType>(() => {
    const types: TextAnimationType[] = ['typewriter', 'fadeIn', 'slideUp', 'pop', 'wave'];
    return types[Math.floor(Math.random() * types.length)];
  });
  
  useEffect(() => {
    if (!text) {
      setDisplayedChars([]);
      return;
    }
    
    const chars = text.split('');
    setDisplayedChars([]);
    
    if (animationType === 'typewriter') {
      let index = 0;
      const interval = setInterval(() => {
        if (index < chars.length) {
          setDisplayedChars(prev => [...prev, chars[index]]);
          index++;
        } else {
          clearInterval(interval);
        }
      }, 25 + Math.random() * 15);
      return () => clearInterval(interval);
    } else {
      // For other animations, show all chars immediately with staggered animation
      setDisplayedChars(chars);
    }
  }, [text, animationType]);
  
  const getCharStyle = (index: number): React.CSSProperties => {
    const delay = index * 0.03;
    
    switch (animationType) {
      case 'fadeIn':
        return {
          animation: `charFadeIn 0.4s ease-out ${delay}s both`,
          display: 'inline-block'
        };
      case 'slideUp':
        return {
          animation: `charSlideUp 0.3s ease-out ${delay}s both`,
          display: 'inline-block'
        };
      case 'pop':
        return {
          animation: `charPop 0.25s ease-out ${delay}s both`,
          display: 'inline-block'
        };
      case 'wave':
        return {
          animation: `charWave 0.5s ease-in-out ${delay}s both`,
          display: 'inline-block'
        };
      default:
        return { display: 'inline' };
    }
  };
  
  return (
    <>
      <style>{`
        @keyframes charFadeIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes charSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes charPop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes charWave {
          0% { transform: translateY(0); }
          30% { transform: translateY(-3px); }
          60% { transform: translateY(1px); }
          100% { transform: translateY(0); }
        }
      `}</style>
      <span>
        {displayedChars.map((char, i) => (
          <span key={`${i}-${char}`} style={getCharStyle(i)}>
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
    </>
  );
});

const FloatingMascot = memo(function FloatingMascot({
  mode = 'IDLE',
  initialPosition,
  onPositionChange,
  onModeChange,
  disabled = false,
  userId
}: FloatingMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  // Trinity Stars: Co (cyan), AI (purple), L (gold) - 120° offset for triangular formation, spells "CoAIL"
  const twinsRef = useRef<Twin[]>([
    { x: 0, y: 0, angle: 0, color: '#38bdf8', trail: [] },                    // Cyan - "Co"
    { x: 0, y: 0, angle: (Math.PI * 2) / 3, color: '#a855f7', trail: [] },    // Purple - "AI"
    { x: 0, y: 0, angle: (Math.PI * 4) / 3, color: '#f4c15d', trail: [] }     // Gold - "L"
  ]);
  const timeRef = useRef(0);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([]);
  
  // Status Emote Effects - dynamic visual behaviors for different modes
  const statusEffectsRef = useRef<StatusEmoteEffects>(new StatusEmoteEffects());
  const lastModeRef = useRef<MascotMode>('IDLE');
  
  // Motion pattern state - AI Brain can switch this
  const [activeMotionPattern, setActiveMotionPattern] = useState<MotionPattern>('TRIAD_SYNCHRONIZED');
  const [showHolidayDecorations, setShowHolidayDecorations] = useState(true);
  const [holidayLedColors, setHolidayLedColors] = useState<string[][]>([
    ['#ff0000', '#ffffff', '#00ff00'],
    ['#ff00ff', '#00ffff', '#ffff00'],
    ['#ffcc00', '#ff6600', '#ffffff']
  ]);
  
  // Seasonal theme for holiday decorations
  const { seasonId } = useSeasonalTheme();
  const isChristmas = seasonId === 'christmas' || seasonId === 'winter' || seasonId === 'newYear';
  
  // Fetch holiday directives from AI Brain orchestrator
  const { data: holidayDirective } = useQuery<HolidayDirectiveResponse>({
    queryKey: ['/api/mascot/holiday/directives'],
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: isChristmas,
  });
  
  // Apply AI Brain directives when received
  useEffect(() => {
    if (holidayDirective?.success) {
      // Apply motion profile if available
      if (holidayDirective.motionProfile?.patternType) {
        const pattern = holidayDirective.motionProfile.patternType as MotionPattern;
        if (pattern in MOTION_PATTERNS) {
          setActiveMotionPattern(pattern);
        }
      }
      
      // Apply decoration settings if available
      if (holidayDirective.holidayDecor?.starDecorations) {
        const decor = holidayDirective.holidayDecor.starDecorations;
        const newColors: string[][] = [];
        
        for (const key of ['co', 'ai', 'nx']) {
          if (decor[key]?.glowPalette) {
            newColors.push(decor[key].glowPalette);
          } else {
            newColors.push(['#ff0000', '#00ff00', '#ffffff']);
          }
        }
        setHolidayLedColors(newColors);
        setShowHolidayDecorations(holidayDirective.holidayDecor.isActive);
      }
    }
  }, [holidayDirective]);
  
  // Trinity Physics with DYNAMIC CONFIG - no hardcoded values
  const sizes = getDeviceSizes();
  const mascotSize = sizes.bubble;
  const trinityConfig = TRINITY_STAR_CONFIG;
  
  const physicsRef = useRef<TrinityPhysics | null>(null);
  if (!physicsRef.current) {
    // Use config values for physics - fully dynamic
    physicsRef.current = new TrinityPhysics({ 
      minDistance: trinityConfig.minDistance,
      repulsionStrength: trinityConfig.repulsionStrength,
      springStrength: trinityConfig.springStrength,
    });
  }

  const [currentMode, setCurrentMode] = useState<MascotMode>(mode);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [currentEmote, setCurrentEmote] = useState<Emote | null>(null);
  const [tapRipple, setTapRipple] = useState<{ x: number; y: number; active: boolean } | null>(null);
  const [currentThought, setCurrentThought] = useState<string>('');
  const [showThought, setShowThought] = useState(false);
  
  // ============================================================================
  // EMOTE PHASE STATE MACHINE
  // Tracks current phase, loops through sequence, auto-returns to IDLE
  // Supports: finite loops (loopCount > 0), infinite loops (-1), and loopPhases
  // ============================================================================
  const emotePhaseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const emotePhaseIndexRef = useRef<number>(0);
  const remainingLoopsRef = useRef<number>(0);
  const [currentEmotePhase, setCurrentEmotePhase] = useState<EmotePhase>('IDLE');
  
  // Effect: Manage emote phase transitions with automatic idle return
  useEffect(() => {
    // Clean up any existing timer
    if (emotePhaseTimerRef.current) {
      clearTimeout(emotePhaseTimerRef.current);
      emotePhaseTimerRef.current = null;
    }
    
    // Reset phase when mode changes
    if (currentMode === 'IDLE') {
      emotePhaseIndexRef.current = 0;
      remainingLoopsRef.current = 0;
      setCurrentEmotePhase('IDLE');
      return;
    }
    
    // Get phase config for current mode
    const phaseConfig = getEmotePhaseConfig(currentMode);
    if (!phaseConfig || phaseConfig.phases.length === 0) {
      setCurrentEmotePhase('IDLE');
      return;
    }
    
    // Initialize loop counter for finite loops
    emotePhaseIndexRef.current = 0;
    remainingLoopsRef.current = phaseConfig.loopCount || 0;
    setCurrentEmotePhase(phaseConfig.phases[0]);
    
    // Find loop phase boundaries if loopPhases defined
    // Returns 0 if loopPhases not found or phase not in sequence (safe fallback)
    const findLoopStartIndex = (config: typeof phaseConfig): number => {
      if (!config.loopPhases || config.loopPhases.length === 0) return 0;
      const firstLoopPhase = config.loopPhases[0];
      const index = config.phases.indexOf(firstLoopPhase);
      return index >= 0 ? index : 0; // Safe fallback to 0 if not found
    };
    
    // Schedule phase transitions
    const advancePhase = () => {
      const config = getEmotePhaseConfig(currentMode);
      if (!config) return;
      
      emotePhaseIndexRef.current++;
      
      // Check if we've completed all phases
      if (emotePhaseIndexRef.current >= config.phases.length) {
        // Handle looping based on loopCount
        if (config.loopCount === -1) {
          // Infinite loop - restart from loop start
          const loopStart = findLoopStartIndex(config);
          emotePhaseIndexRef.current = loopStart;
          setCurrentEmotePhase(config.phases[loopStart]);
          scheduleNextPhase();
        } else if (remainingLoopsRef.current > 1) {
          // Finite loops remaining - decrement and restart from loop start
          remainingLoopsRef.current--;
          const loopStart = findLoopStartIndex(config);
          emotePhaseIndexRef.current = loopStart;
          setCurrentEmotePhase(config.phases[loopStart]);
          scheduleNextPhase();
        } else if (config.returnToIdleOnComplete) {
          // All loops complete - return to IDLE
          emotePhaseIndexRef.current = 0;
          remainingLoopsRef.current = 0;
          setCurrentEmotePhase('IDLE');
          setCurrentMode('IDLE');
          if (onModeChange) onModeChange('IDLE');
        }
        return;
      }
      
      // Advance to next phase
      setCurrentEmotePhase(config.phases[emotePhaseIndexRef.current]);
      scheduleNextPhase();
    };
    
    const scheduleNextPhase = () => {
      const config = getEmotePhaseConfig(currentMode);
      if (!config) return;
      
      const currentIndex = emotePhaseIndexRef.current;
      if (currentIndex >= config.phases.length) return;
      
      // Get phase name at current index, then look up duration
      const phaseName = config.phases[currentIndex];
      const duration = config.phaseDurations[phaseName] || 500; // Default 500ms if missing
      
      if (duration > 0) {
        emotePhaseTimerRef.current = setTimeout(advancePhase, duration);
      } else {
        // Duration 0 means stay in this phase indefinitely until mode changes
      }
    };
    
    // Start the phase sequence
    scheduleNextPhase();
    
    return () => {
      if (emotePhaseTimerRef.current) {
        clearTimeout(emotePhaseTimerRef.current);
        emotePhaseTimerRef.current = null;
      }
    };
  }, [currentMode, onModeChange]);
  
  // Quality tier state for adaptive rendering
  const [qualityTier, setQualityTier] = useState<QualityTier>(() => detectInitialQualityTier());
  const qualitySettings = useMemo(() => QUALITY_TIERS[qualityTier], [qualityTier]);
  
  // Performance metrics for adaptive quality
  const performanceRef = useRef<PerformanceMetrics>({
    frameTimes: [],
    avgFPS: 60,
    lastMeasurement: Date.now(),
    isIdle: false,
    idleStartTime: null
  });
  const lastFrameTimeRef = useRef(performance.now());

  const posX = useMotionValue(initialPosition?.x ?? window.innerWidth - mascotSize - 20);
  const posY = useMotionValue(initialPosition?.y ?? window.innerHeight - mascotSize - 100);
  
  const springX = useSpring(posX, { stiffness: 300, damping: 30 });
  const springY = useSpring(posY, { stiffness: 300, damping: 30 });

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // DPR-aware canvas scaling for crisp rendering on all devices
    // Clamp DPR to quality tier max for performance optimization
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = Math.min(rawDpr, qualitySettings.maxDPR);
    
    // Set canvas dimensions for sharp rendering
    canvas.width = mascotSize * dpr;
    canvas.height = mascotSize * dpr;
    canvas.style.width = `${mascotSize}px`;
    canvas.style.height = `${mascotSize}px`;
    ctx.scale(dpr, dpr);
    
    // Enable image smoothing for quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = qualityTier === 'high' ? 'high' : 'medium';

    const colors = MODE_COLORS[currentMode];
    twinsRef.current[0].color = colors.primary;
    twinsRef.current[1].color = colors.secondary;
    twinsRef.current[2].color = colors.tertiary;

    // Frame budget tracking for adaptive quality
    let frameSkipCounter = 0;
    let isOverBudget = false;
    
    const animate = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      
      // Track frame times for FPS calculation
      const perf = performanceRef.current;
      perf.frameTimes.push(frameTime);
      if (perf.frameTimes.length > 30) {
        perf.frameTimes.shift();
      }
      
      // Frame budget guard: detect if we're over budget (frame time > 20ms = <50 FPS)
      const FRAME_BUDGET_MS = 20;
      const FRAME_BUDGET_RECOVER_MS = 12;
      isOverBudget = frameTime > FRAME_BUDGET_MS;
      if (frameTime < FRAME_BUDGET_RECOVER_MS) {
        isOverBudget = false;
      }
      
      // Calculate average FPS every 30 frames and adapt quality tier
      if (perf.frameTimes.length >= 30) {
        const avgFrameTime = perf.frameTimes.reduce((a, b) => a + b, 0) / perf.frameTimes.length;
        perf.avgFPS = 1000 / avgFrameTime;
        
        // Adaptive quality: downgrade if FPS is too low, upgrade if recovered
        if (PERFORMANCE_CONFIG.enableAdaptiveQuality) {
          const timeSinceLastMeasure = now - perf.lastMeasurement;
          if (timeSinceLastMeasure > PERFORMANCE_CONFIG.measurementWindow) {
            perf.lastMeasurement = now;
            
            if (perf.avgFPS < PERFORMANCE_CONFIG.qualityDowngradeThreshold && qualityTier !== 'low') {
              console.log(`[Mascot] Quality downgrade: ${qualityTier} -> ${qualityTier === 'high' ? 'medium' : 'low'} (FPS: ${perf.avgFPS.toFixed(1)})`);
              setQualityTier(prev => prev === 'high' ? 'medium' : 'low');
            } else if (perf.avgFPS > PERFORMANCE_CONFIG.qualityUpgradeThreshold && qualityTier !== 'high') {
              console.log(`[Mascot] Quality upgrade: ${qualityTier} -> ${qualityTier === 'low' ? 'medium' : 'high'} (FPS: ${perf.avgFPS.toFixed(1)})`);
              setQualityTier(prev => prev === 'low' ? 'medium' : 'high');
            }
          }
        }
      }
      
      // Idle throttling: reduce FPS when mascot is idle for 5+ seconds
      if (currentMode === 'IDLE' && !isDragging && !isHovered) {
        if (!perf.idleStartTime) {
          perf.idleStartTime = now;
        } else if (now - perf.idleStartTime > PERFORMANCE_CONFIG.idleThrottleDelay) {
          perf.isIdle = true;
        }
      } else {
        perf.idleStartTime = null;
        perf.isIdle = false;
      }
      
      // Skip frames when idle to save battery (~15 FPS instead of 60)
      if (perf.isIdle) {
        frameSkipCounter++;
        const idleFrameSkip = Math.floor(60 / PERFORMANCE_CONFIG.idleTargetFPS);
        if (frameSkipCounter < idleFrameSkip) {
          animationRef.current = requestAnimationFrame(animate);
          return;
        }
        frameSkipCounter = 0;
      }
      
      // Apply frame budget reduction: use lower quality settings when over budget
      const effectiveSettings = isOverBudget ? {
        ...qualitySettings,
        particleCount: Math.floor(qualitySettings.particleCount * 0.5),
        glowBlurRadius: qualitySettings.glowBlurRadius * 0.7,
        enableBlur: false
      } : qualitySettings;
      
      timeRef.current += 0.02 * effectiveSettings.animationSmoothing;
      const t = timeRef.current;
      const center = mascotSize / 2;
      // DYNAMIC orbit radius from config - no hardcoded values
      const radius = Math.max(
        mascotSize * trinityConfig.orbitRadiusMultiplier, 
        trinityConfig.minOrbitRadius
      );
      const floatAmp = trinityConfig.individualFloatAmplitude;

      ctx.clearRect(0, 0, mascotSize, mascotSize);
      
      // Status Emote Effects - detect mode changes and trigger visual effects
      const statusEffects = statusEffectsRef.current;
      if (lastModeRef.current !== currentMode) {
        statusEffects.onModeChange(currentMode, center, center);
        lastModeRef.current = currentMode;
      }
      
      // Update status effects each frame
      statusEffects.update(currentMode, center, center, 1);
      
      // Apply screen shake from status effects (for ERROR mode)
      const shakeOffset = statusEffects.getShakeOffset();
      const applyShake = shakeOffset.x !== 0 || shakeOffset.y !== 0;
      if (applyShake) {
        ctx.save();
        ctx.translate(shakeOffset.x, shakeOffset.y);
      }
      
      // Draw shockwaves and particles BEHIND stars
      statusEffects.drawEffects(ctx, center, center, currentMode);
      
      // INDEPENDENT STARS - No connections, no central glow, fully separate entities
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over'; // No additive blending

      const twins = twinsRef.current;
      
      // Trinity positions with 120° offset - each star floats independently
      let x1: number, y1: number, x2: number, y2: number, x3: number, y3: number;
      
      // 120° offset for triangular base formation
      const trinityOffset = (Math.PI * 2) / 3;
      
      // Individual float offsets - each star has unique floating rhythm (from config)
      const floatOffset1 = Math.sin(t * 1.3) * floatAmp + Math.cos(t * 0.7) * (floatAmp * 0.66);
      const floatOffset2 = Math.sin(t * 1.1 + 1.5) * floatAmp + Math.cos(t * 0.9 + 0.8) * (floatAmp * 0.66);
      const floatOffset3 = Math.sin(t * 0.9 + 3.0) * floatAmp + Math.cos(t * 1.2 + 2.1) * (floatAmp * 0.66);
      
      switch (currentMode) {
        case 'IDLE':
          // Each star rotates at slightly different speeds for organic independent motion
          twins[0].angle += 0.012;
          twins[1].angle += 0.014;
          twins[2].angle += 0.011;
          
          // Stars float independently around their base triangle positions
          x1 = center + Math.cos(twins[0].angle) * radius + floatOffset1;
          y1 = center + Math.sin(twins[0].angle) * radius + floatOffset2 * 0.6;
          x2 = center + Math.cos(twins[1].angle + trinityOffset) * radius + floatOffset2;
          y2 = center + Math.sin(twins[1].angle + trinityOffset) * radius + floatOffset3 * 0.6;
          x3 = center + Math.cos(twins[2].angle + trinityOffset * 2) * radius + floatOffset3;
          y3 = center + Math.sin(twins[2].angle + trinityOffset * 2) * radius + floatOffset1 * 0.6;
          break;
        
        case 'THINKING':
        case 'ANALYZING':
          twins.forEach((twin, i) => { twin.angle += 0.08; });
          x1 = center + Math.cos(twins[0].angle) * radius;
          y1 = center + Math.sin(twins[0].angle) * radius;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius;
          break;
        
        case 'SEARCHING':
          twins[0].angle += 0.02;
          // Maintain full separation - all 3 stars on circle
          x1 = center + Math.cos(twins[0].angle) * radius;
          y1 = center + Math.sin(twins[0].angle) * radius;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius;
          break;
        
        case 'CODING':
          const gridStep = t * 2;
          // Maintain full triangle separation with grid pattern animation
          x1 = center + Math.cos(gridStep) * radius + (Math.floor(gridStep) % 2) * 5;
          y1 = center + Math.sin(gridStep) * radius;
          x2 = center + Math.cos(gridStep + trinityOffset) * radius - (Math.floor(gridStep) % 2) * 5;
          y2 = center + Math.sin(gridStep + trinityOffset) * radius;
          x3 = center + Math.cos(gridStep + trinityOffset * 2) * radius;
          y3 = center + Math.sin(gridStep + trinityOffset * 2) * radius;
          break;
        
        case 'LISTENING':
          const wave = Math.sin(t * 4) * radius * 0.2;
          // Full separation with wave oscillation
          x1 = center + Math.cos(twins[0].angle) * radius + wave;
          y1 = center + Math.sin(twins[0].angle) * radius;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius - wave * 0.5;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius + wave * 0.3;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius;
          twins[0].angle += 0.01;
          break;
        
        case 'UPLOADING':
          const uploadAngle = t * 3;
          // Full separation with upward pulse animation
          x1 = center + Math.cos(uploadAngle) * radius;
          y1 = center + Math.sin(uploadAngle) * radius - Math.abs(Math.sin(t * 5)) * radius * 0.2;
          x2 = center + Math.cos(uploadAngle + trinityOffset) * radius;
          y2 = center + Math.sin(uploadAngle + trinityOffset) * radius - Math.abs(Math.sin(t * 5 + 1)) * radius * 0.2;
          x3 = center + Math.cos(uploadAngle + trinityOffset * 2) * radius;
          y3 = center + Math.sin(uploadAngle + trinityOffset * 2) * radius - Math.abs(Math.sin(t * 5 + 2)) * radius * 0.2;
          break;
        
        case 'SUCCESS':
        case 'CELEBRATING':
          const celebAngle = t * 3;
          x1 = center + Math.cos(celebAngle) * radius * (1 + Math.sin(t * 5) * 0.15);
          y1 = center + Math.sin(celebAngle) * radius - Math.abs(Math.sin(t * 4)) * radius * 0.25;
          x2 = center + Math.cos(celebAngle + trinityOffset) * radius * (1 + Math.sin(t * 5 + trinityOffset) * 0.15);
          y2 = center + Math.sin(celebAngle + trinityOffset) * radius - Math.abs(Math.sin(t * 4 + trinityOffset / 2)) * radius * 0.25;
          x3 = center + Math.cos(celebAngle + trinityOffset * 2) * radius * (1 + Math.sin(t * 5 + trinityOffset * 2) * 0.15);
          y3 = center + Math.sin(celebAngle + trinityOffset * 2) * radius - Math.abs(Math.sin(t * 4 + trinityOffset)) * radius * 0.25;
          break;
        
        case 'ERROR':
          const shake = Math.sin(t * 20) * radius * 0.08;
          // Full separation maintained with shake effect
          x1 = center + Math.cos(twins[0].angle) * radius + shake;
          y1 = center + Math.sin(twins[0].angle) * radius + shake * 0.5;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius - shake;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius - shake * 0.5;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius + shake * 0.7;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius - shake * 0.3;
          twins[0].angle += 0.05;
          break;
        
        default:
          twins.forEach((twin, i) => { twin.angle += 0.02; });
          x1 = center + Math.cos(twins[0].angle) * radius;
          y1 = center + Math.sin(twins[0].angle) * radius;
          x2 = center + Math.cos(twins[0].angle + trinityOffset) * radius;
          y2 = center + Math.sin(twins[0].angle + trinityOffset) * radius;
          x3 = center + Math.cos(twins[0].angle + trinityOffset * 2) * radius;
          y3 = center + Math.sin(twins[0].angle + trinityOffset * 2) * radius;
      }

      // Set physics target positions (relative to center)
      const physics = physicsRef.current;
      if (physics) {
        physics.setBounds(mascotSize, mascotSize);
        physics.setTargetPositions([
          { x: x1 - center, y: y1 - center },
          { x: x2 - center, y: y2 - center },
          { x: x3 - center, y: y3 - center }
        ]);
        
        // Run physics simulation with collision detection
        const positions = physics.update(1);
        
        // Apply physics positions (converted back to screen coords)
        twins[0].x = center + positions[0].x;
        twins[0].y = center + positions[0].y;
        twins[1].x = center + positions[1].x;
        twins[1].y = center + positions[1].y;
        twins[2].x = center + positions[2].x;
        twins[2].y = center + positions[2].y;
      } else {
        // Fallback to direct assignment
        twins[0].x = x1;
        twins[0].y = y1;
        twins[1].x = x2;
        twins[1].y = y2;
        twins[2].x = x3;
        twins[2].y = y3;
      }

      // No trails - stars float cleanly without any visual connections
      ctx.globalAlpha = 1;

      // Trinity branding: "Co" on cyan, "AI" on purple, "L" on gold - spells "CoAIL"
      const brandingLabels = ['Co', 'AI', 'L'];
      const brandingColors = ['#a855f7', '#38bdf8', '#38bdf8'];
      
      // INDEPENDENT STAR RENDERING - Each star is a distinct entity with NO visual overlap
      const qs = qualitySettings;
      
      twins.forEach((twin, index) => {
        // DYNAMIC star sizing from config - compact and never overlaps
        const starSize = mascotSize * trinityConfig.starSizeMultiplier;
        const innerSize = starSize * 0.5;
        
        // MINIMAL glow from config - tight around star, no overlap possible
        const maxGlowRadius = starSize * trinityConfig.glowRadiusMultiplier;
        const actualGlowRadius = Math.min(starSize * qs.glowBlurRadius * 0.5, maxGlowRadius);
        
        // Subtle glow halo - each star glows independently
        if (qs.haloAlpha > 0) {
          const cappedAlpha = Math.min(qs.haloAlpha, 0.25); // Very subtle glow
          const haloGradient = ctx.createRadialGradient(
            twin.x, twin.y, starSize * 0.8, // Start glow from edge of star
            twin.x, twin.y, starSize + actualGlowRadius // Tight outer edge
          );
          const haloAlphaHex = Math.round(cappedAlpha * 255).toString(16).padStart(2, '0');
          const haloFadeHex = Math.round(cappedAlpha * 0.1 * 255).toString(16).padStart(2, '0');
          haloGradient.addColorStop(0, `${twin.color}${haloAlphaHex}`);
          haloGradient.addColorStop(0.6, `${twin.color}${haloFadeHex}`);
          haloGradient.addColorStop(1, 'transparent');
          
          ctx.beginPath();
          ctx.arc(twin.x, twin.y, starSize + actualGlowRadius, 0, Math.PI * 2);
          ctx.fillStyle = haloGradient;
          ctx.fill();
        }
        
        // Main star body with enhanced gradient for depth
        const bodyGradient = ctx.createRadialGradient(
          twin.x - starSize * 0.2, twin.y - starSize * 0.2, 0,
          twin.x, twin.y, starSize
        );
        bodyGradient.addColorStop(0, '#ffffff');
        bodyGradient.addColorStop(0.2, '#ffffff');
        bodyGradient.addColorStop(0.35, twin.color);
        bodyGradient.addColorStop(1, twin.color);
        
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, starSize, 0, Math.PI * 2);
        ctx.fillStyle = bodyGradient;
        ctx.fill();
        
        // Quality-aware rim light for depth (high tier only)
        if (qs.enableRimLight) {
          const rimGradient = ctx.createRadialGradient(
            twin.x + starSize * 0.3, twin.y + starSize * 0.3, starSize * 0.6,
            twin.x, twin.y, starSize
          );
          rimGradient.addColorStop(0, 'transparent');
          rimGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.15)');
          rimGradient.addColorStop(1, 'rgba(255, 255, 255, 0.25)');
          
          ctx.beginPath();
          ctx.arc(twin.x, twin.y, starSize, 0, Math.PI * 2);
          ctx.fillStyle = rimGradient;
          ctx.fill();
        }
        
        // Inner glow core - quality-aware
        if (qs.enableInnerGlow) {
          const innerGlowGradient = ctx.createRadialGradient(
            twin.x, twin.y, 0,
            twin.x, twin.y, innerSize * 1.5
          );
          innerGlowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          innerGlowGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
          innerGlowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          
          ctx.beginPath();
          ctx.arc(twin.x, twin.y, innerSize * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = innerGlowGradient;
          ctx.fill();
        }
        
        // Bright inner core - always rendered for visibility
        const coreGradient = ctx.createRadialGradient(
          twin.x - innerSize * 0.1, twin.y - innerSize * 0.1, 0,
          twin.x, twin.y, innerSize
        );
        coreGradient.addColorStop(0, '#ffffff');
        coreGradient.addColorStop(0.6, '#ffffff');
        coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
        
        ctx.beginPath();
        ctx.arc(twin.x, twin.y, innerSize, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
        ctx.fill();
        
        // Text label with subtle shadow for readability
        const fontSize = Math.max(7, mascotSize * 0.11);
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Shadow for text contrast (only on high quality)
        if (qs.shadowQuality === 'full') {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 1;
        }
        
        ctx.fillStyle = brandingColors[index];
        ctx.fillText(brandingLabels[index], twin.x, twin.y + 0.5);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Christmas LED wrap decoration - quality-aware LED count
        if (isChristmas && showHolidayDecorations) {
          const colors = holidayLedColors[index] || ['#ff0000', '#00ff00', '#ffffff'];
          drawLEDWrap(ctx, twin.x, twin.y, starSize, t, colors, qs.ledCount, 0.4 + index * 0.1);
        }
      });

      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 0.02;
        
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      
      // Restore context if shake transform was applied (uses applyShake flag from earlier)
      if (applyShake) {
        ctx.restore();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [currentMode, mascotSize, isChristmas, showHolidayDecorations, holidayLedColors, qualitySettings, qualityTier, isDragging, isHovered]);

  useEffect(() => {
    setCurrentMode(mode);
    // Reset physics to prevent residual overlap when switching modes
    if (physicsRef.current) {
      physicsRef.current.resetToTargets();
    }
  }, [mode]);

  useEffect(() => {
    uiAvoidanceSystem.updateConfig({ mascotSize });
    uiAvoidanceSystem.start();
    userActionTracker.start();

    const unsubAvoidance = uiAvoidanceSystem.subscribe((newPos) => {
      if (!isDragging) {
        posX.set(newPos.x);
        posY.set(newPos.y);
        onPositionChange?.(newPos);
      }
    });

    const unsubEmotes = emotesManager.subscribe((emote) => {
      setCurrentEmote(emote);
    });

    const unsubActions = userActionTracker.subscribe((event) => {
      handleUserAction(event);
    });

    const unsubThoughts = thoughtManager.subscribe((thought) => {
      if (thought) {
        setCurrentThought(thought.text);
        setShowThought(true);
      } else {
        setShowThought(false);
      }
    });

    return () => {
      unsubAvoidance();
      unsubEmotes();
      unsubActions();
      unsubThoughts();
      uiAvoidanceSystem.stop();
      userActionTracker.stop();
    };
  }, [mascotSize, isDragging]);

  const handleUserAction = useCallback((event: ActionEvent) => {
    switch (event.action) {
      case 'loading_start':
        setCurrentMode('THINKING');
        onModeChange?.('THINKING');
        break;
      case 'success':
        setCurrentMode('SUCCESS');
        onModeChange?.('SUCCESS');
        spawnParticles(10);
        setTimeout(() => {
          setCurrentMode('IDLE');
          onModeChange?.('IDLE');
        }, 2000);
        break;
      case 'error':
        setCurrentMode('ERROR');
        onModeChange?.('ERROR');
        setTimeout(() => {
          setCurrentMode('IDLE');
          onModeChange?.('IDLE');
        }, 2000);
        break;
      case 'typing':
        setCurrentMode('LISTENING');
        onModeChange?.('LISTENING');
        break;
      case 'typing_stop':
        setCurrentMode('IDLE');
        onModeChange?.('IDLE');
        break;
      case 'form_submit':
        setCurrentMode('UPLOADING');
        onModeChange?.('UPLOADING');
        break;
      case 'idle_long':
        thoughtManager.triggerModeThought('IDLE');
        break;
    }
  }, [onModeChange]);

  const spawnParticles = useCallback((count: number) => {
    const colors = MODE_COLORS[currentMode];
    const center = mascotSize / 2;
    
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      particlesRef.current.push({
        x: center,
        y: center,
        vx: Math.cos(angle) * (2 + Math.random() * 2),
        vy: Math.sin(angle) * (2 + Math.random() * 2) - 2,
        life: 1,
        color: i % 2 === 0 ? colors.primary : colors.secondary
      });
    }
  }, [currentMode, mascotSize]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    triggerHaptic(15); // Subtle haptic on drag start
    emotesManager.triggerByCategory('playful');
  }, []);

  const handleDrag = useCallback((_: unknown, info: { point: { x: number; y: number } }) => {
    const newX = info.point.x - mascotSize / 2;
    const newY = info.point.y - mascotSize / 2;
    
    const boundedX = Math.max(10, Math.min(newX, window.innerWidth - mascotSize - 10));
    const boundedY = Math.max(10, Math.min(newY, window.innerHeight - mascotSize - 10));
    
    posX.set(boundedX);
    posY.set(boundedY);
    uiAvoidanceSystem.setCurrentPosition({ x: boundedX, y: boundedY });
  }, [mascotSize, posX, posY]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    
    const currentPos = { x: posX.get(), y: posY.get() };
    const safePos = uiAvoidanceSystem.findSafePosition(currentPos);
    
    posX.set(safePos.x);
    posY.set(safePos.y);
    onPositionChange?.(safePos);
    
    if (userId) {
      localStorage.setItem(`mascot-pos-${userId}`, JSON.stringify(safePos));
    }
    
    emotesManager.triggerById('drag-end-nice');
  }, [posX, posY, onPositionChange, userId]);

  const handleTap = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    triggerHaptic(10); // Light haptic on tap
    emotesManager.triggerByCategory('clicking');
    spawnParticles(5);
    
    // Trigger visual tap ripple for mobile feedback
    const isMobile = 'ontouchstart' in window;
    if (isMobile && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const point = 'touches' in event ? event.touches[0] : event;
      const x = (point as { clientX: number }).clientX - rect.left;
      const y = (point as { clientY: number }).clientY - rect.top;
      setTapRipple({ x, y, active: true });
      setTimeout(() => setTapRipple(null), 400);
    }
  }, [spawnParticles]);

  const getEmoteAnimation = useCallback(() => {
    if (!currentEmote) return {};
    
    const anim = EMOTE_ANIMATIONS[currentEmote.animation];
    if (!anim) return {};
    
    return {
      animation: `${currentEmote.animation} ${anim.duration}ms ${anim.easing} ${anim.iterations === -1 ? 'infinite' : anim.iterations}`
    };
  }, [currentEmote]);

  if (disabled) return null;

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          25% { transform: translateY(-8px) scale(1.05); }
          50% { transform: translateY(-12px) scale(1.1); }
          75% { transform: translateY(-4px) scale(1.02); }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes jump {
          0% { transform: translateY(0) scaleY(1); }
          15% { transform: translateY(0) scaleY(0.8) scaleX(1.1); }
          30% { transform: translateY(-20px) scaleY(1.1) scaleX(0.95); }
          50% { transform: translateY(-25px) scaleY(1); }
          70% { transform: translateY(-10px) scaleY(1); }
          85% { transform: translateY(0) scaleY(0.9) scaleX(1.05); }
          100% { transform: translateY(0) scaleY(1); }
        }
        @keyframes sparkle {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 2px currentColor); }
          50% { filter: brightness(1.4) drop-shadow(0 0 8px currentColor); }
        }
        @keyframes dance {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-5px) rotate(-5deg); }
          50% { transform: translateY(0) rotate(5deg); }
          75% { transform: translateY(-3px) rotate(-3deg); }
        }
        @keyframes explode {
          0% { transform: scale(1); filter: brightness(1); }
          30% { transform: scale(1.5); filter: brightness(2); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        @keyframes tapRipple {
          0% { transform: scale(0); opacity: 0.6; }
          50% { opacity: 0.4; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>

      <motion.div
        ref={containerRef}
        className="fixed pointer-events-auto cursor-grab active:cursor-grabbing select-none"
        style={{
          x: springX,
          y: springY,
          width: mascotSize,
          height: mascotSize,
          zIndex: MASCOT_CONFIG.zIndex,
          touchAction: 'none'
        }}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        whileHover={{ scale: 1.05, transition: { duration: 0.15 } }}
        whileTap={{ scale: 0.92, transition: { duration: 0.08 } }}
        data-testid="floating-mascot"
      >
        <motion.div
          className="relative w-full h-full"
          style={getEmoteAnimation()}
          animate={isDragging ? { scale: 1.1, rotate: [0, -3, 3, -3, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ 
              width: mascotSize, 
              height: mascotSize
            }}
            data-testid="mascot-canvas"
          />
          
          {/* Mobile tap ripple effect */}
          {tapRipple?.active && (
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                left: tapRipple.x,
                top: tapRipple.y,
                width: 40,
                height: 40,
                marginLeft: -20,
                marginTop: -20,
                background: `radial-gradient(circle, ${MODE_COLORS[currentMode].primary}40 0%, transparent 70%)`,
                animation: 'tapRipple 400ms ease-out forwards'
              }}
            />
          )}
          
          {isHovered && (
            <motion.div
              className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase whitespace-nowrap"
              style={{
                background: `linear-gradient(135deg, ${MODE_COLORS[currentMode].primary}25, ${MODE_COLORS[currentMode].secondary}25)`,
                color: '#ffffff',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${MODE_COLORS[currentMode].primary}40`,
                textShadow: `0 0 6px ${MODE_COLORS[currentMode].primary}`
              }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              CoAI
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {(showThought || currentEmote) && (
          <motion.div
            className="fixed pointer-events-none"
            style={{
              left: springX.get() + mascotSize + 10,
              top: springY.get() - 8,
              zIndex: MASCOT_CONFIG.zIndex + 1,
              maxWidth: 180
            }}
            initial={{ opacity: 0, scale: 0.75, x: -10, y: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: 10, y: -15 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <style>{`
              @keyframes floatAway {
                0% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-30px); }
              }
              .thought-float {
                animation: floatAway 4s ease-out forwards;
              }
            `}</style>
            <div
              className="relative px-0 py-0 text-[11px] font-medium leading-relaxed thought-float"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), 1px 1px 2px rgba(0,0,0,0.95)',
                filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))'
              }}
            >
              <AnimatedText text={currentEmote?.expression || currentThought} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default FloatingMascot;
