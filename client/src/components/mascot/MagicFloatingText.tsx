/**
 * MagicFloatingText - Independent per-letter animated text for mascot
 * 
 * Features:
 * - Zero border, zero background - completely transparent
 * - Each letter is independent with unique color/animation/effects
 * - Letters spawn synchronously to form words then disappear uniquely
 * - Smart positioning relative to mascot and screen edges
 * - Mobile responsive
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Thought } from '@/lib/mascot/ThoughtManager';

// Color palettes for letter variety
const LETTER_COLORS = {
  cyan: ['#00d4ff', '#00bcd4', '#26c6da', '#4dd0e1', '#80deea'],
  purple: ['#a855f7', '#9333ea', '#7c3aed', '#8b5cf6', '#c084fc'],
  gold: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#d97706'],
  rainbow: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'],
  warm: ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ff6b6b'],
  cool: ['#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#0ea5e9'],
  magic: ['#c084fc', '#e879f9', '#f0abfc', '#a78bfa', '#818cf8'],
};

// Enter animations for individual letters
const LETTER_ENTER_ANIMATIONS = [
  'fadeIn', 'popIn', 'dropIn', 'slideUp', 'slideLeft', 'slideRight',
  'zoomIn', 'spinIn', 'bounceIn', 'flipIn', 'glowIn', 'typeIn'
];

// Exit animations for individual letters  
const LETTER_EXIT_ANIMATIONS = [
  'fadeOut', 'popOut', 'floatUp', 'floatDown', 'spinOut', 'shrinkOut',
  'dissolve', 'sparkleOut', 'driftAway', 'burstOut', 'slideOut', 'glitchOut'
];

// Font variations for letters
const FONT_STYLES = [
  { fontWeight: 400, fontStyle: 'normal' },
  { fontWeight: 500, fontStyle: 'normal' },
  { fontWeight: 600, fontStyle: 'normal' },
  { fontWeight: 700, fontStyle: 'normal' },
  { fontWeight: 800, fontStyle: 'normal' },
];

interface LetterState {
  char: string;
  color: string;
  glowColor: string;
  scale: number;
  rotation: number;
  enterAnim: string;
  exitAnim: string;
  fontStyle: { fontWeight: number; fontStyle: string };
  delay: number;
  isVisible: boolean;
  isExiting: boolean;
  offsetX: number;
  offsetY: number;
}

interface MagicFloatingTextProps {
  thought: Thought | null;
  mascotPosition: { x: number; y: number };
  mascotSize: number;
  isMobile?: boolean;
}

// Pick random item from array
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Generate unique letter states
const generateLetterStates = (text: string, colorPalette: string[]): LetterState[] => {
  return text.split('').map((char, index) => {
    const baseColor = pickRandom(colorPalette);
    return {
      char,
      color: baseColor,
      glowColor: baseColor,
      scale: 0.9 + Math.random() * 0.3, // 0.9-1.2
      rotation: (Math.random() - 0.5) * 8, // -4 to 4 degrees
      enterAnim: pickRandom(LETTER_ENTER_ANIMATIONS),
      exitAnim: pickRandom(LETTER_EXIT_ANIMATIONS),
      fontStyle: pickRandom(FONT_STYLES),
      delay: index * 35 + Math.random() * 20, // Staggered appear
      isVisible: false,
      isExiting: false,
      offsetX: (Math.random() - 0.5) * 2,
      offsetY: (Math.random() - 0.5) * 2,
    };
  });
};

// Calculate smart position based on mascot location and screen edges
const calculateSmartPosition = (
  mascotPos: { x: number; y: number },
  mascotSize: number,
  isMobile: boolean
): { 
  position: React.CSSProperties;
  direction: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right';
} => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  // Mascot position from bottom-right corner
  const mascotRight = mascotPos.x;
  const mascotBottom = mascotPos.y;
  
  // Convert to actual screen coordinates (mascot uses bottom-right positioning)
  const mascotScreenX = viewportWidth - mascotRight - mascotSize / 2;
  const mascotScreenY = viewportHeight - mascotBottom - mascotSize / 2;
  
  // Padding from edges
  const edgePadding = isMobile ? 10 : 20;
  const textMargin = isMobile ? 8 : 15;
  
  // Determine best position based on mascot location
  const isNearTop = mascotScreenY < viewportHeight * 0.3;
  const isNearBottom = mascotScreenY > viewportHeight * 0.7;
  const isNearLeft = mascotScreenX < viewportWidth * 0.3;
  const isNearRight = mascotScreenX > viewportWidth * 0.7;
  
  let direction: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' = 'top';
  let position: React.CSSProperties = {};
  
  if (isNearBottom && isNearRight) {
    // Mascot in bottom-right: text goes top-left
    direction = 'top-left';
    position = {
      bottom: `${mascotBottom + mascotSize + textMargin}px`,
      right: `${mascotRight + mascotSize * 0.3}px`,
    };
  } else if (isNearBottom && isNearLeft) {
    // Mascot in bottom-left: text goes top-right
    direction = 'top-right';
    position = {
      bottom: `${mascotBottom + mascotSize + textMargin}px`,
      left: `${viewportWidth - mascotRight + textMargin}px`,
    };
  } else if (isNearTop && isNearRight) {
    // Mascot in top-right: text goes bottom-left
    direction = 'bottom';
    position = {
      top: `${viewportHeight - mascotBottom + mascotSize + textMargin}px`,
      right: `${mascotRight + mascotSize * 0.3}px`,
    };
  } else if (isNearRight) {
    // Mascot on right edge: text goes left
    direction = 'left';
    position = {
      bottom: `${mascotBottom + mascotSize * 0.3}px`,
      right: `${mascotRight + mascotSize + textMargin}px`,
    };
  } else if (isNearLeft) {
    // Mascot on left edge: text goes right
    direction = 'right';
    position = {
      bottom: `${mascotBottom + mascotSize * 0.3}px`,
      left: `${viewportWidth - mascotRight + textMargin}px`,
    };
  } else {
    // Default: text above mascot
    direction = 'top';
    position = {
      bottom: `${mascotBottom + mascotSize + textMargin}px`,
      right: `${mascotRight}px`,
    };
  }
  
  // Ensure text stays on screen
  if (position.right !== undefined && typeof position.right === 'string') {
    const rightVal = parseInt(position.right);
    if (rightVal < edgePadding) {
      position.right = `${edgePadding}px`;
    }
  }
  if (position.left !== undefined && typeof position.left === 'string') {
    const leftVal = parseInt(position.left);
    if (leftVal < edgePadding) {
      position.left = `${edgePadding}px`;
    }
  }
  
  return { position, direction };
};

export function MagicFloatingText({
  thought,
  mascotPosition,
  mascotSize,
  isMobile = false,
}: MagicFloatingTextProps) {
  const [letters, setLetters] = useState<LetterState[]>([]);
  const [isActive, setIsActive] = useState(false);
  const lastThoughtIdRef = useRef<string | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  
  // Choose color palette based on thought type or random
  const colorPalette = useMemo(() => {
    const palettes = Object.values(LETTER_COLORS);
    return pickRandom(palettes);
  }, [thought?.id]);
  
  // Calculate smart position
  const { position, direction } = useMemo(() => 
    calculateSmartPosition(mascotPosition, mascotSize, isMobile),
    [mascotPosition.x, mascotPosition.y, mascotSize, isMobile]
  );
  
  // Clear all timers
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);
  
  // Handle thought changes
  useEffect(() => {
    clearAllTimers();
    
    if (thought && thought.id !== lastThoughtIdRef.current) {
      lastThoughtIdRef.current = thought.id;
      
      // Generate new letter states
      const newLetters = generateLetterStates(thought.text, colorPalette);
      setLetters(newLetters);
      setIsActive(true);
      
      // Stagger letter appearances
      newLetters.forEach((letter, index) => {
        const timer = setTimeout(() => {
          setLetters(prev => prev.map((l, i) => 
            i === index ? { ...l, isVisible: true } : l
          ));
        }, letter.delay);
        timersRef.current.push(timer);
      });
      
      // Calculate duration
      const now = Date.now();
      const duration = thought.expiresAt ? Math.max(thought.expiresAt - now, 2500) : 4000;
      const exitStartTime = Math.max(duration - 1200, 1000);
      
      // Start exit animations with stagger
      const exitTimer = setTimeout(() => {
        newLetters.forEach((_, index) => {
          const exitDelay = index * 40 + Math.random() * 60;
          const timer = setTimeout(() => {
            setLetters(prev => prev.map((l, i) => 
              i === index ? { ...l, isExiting: true } : l
            ));
          }, exitDelay);
          timersRef.current.push(timer);
        });
      }, exitStartTime);
      timersRef.current.push(exitTimer);
      
      // Hide completely after duration
      const hideTimer = setTimeout(() => {
        setIsActive(false);
        setLetters([]);
        lastThoughtIdRef.current = null;
      }, duration + 500);
      timersRef.current.push(hideTimer);
      
    } else if (!thought) {
      setIsActive(false);
      setLetters([]);
      lastThoughtIdRef.current = null;
    }
    
    return clearAllTimers;
  }, [thought?.id, thought?.text, thought?.expiresAt, colorPalette, clearAllTimers]);
  
  // Get enter animation CSS for a letter
  const getEnterAnimation = (anim: string, delay: number): string => {
    const duration = 0.4 + Math.random() * 0.2;
    return `${anim} ${duration}s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms forwards`;
  };
  
  // Get exit animation CSS for a letter
  const getExitAnimation = (anim: string): string => {
    const duration = 0.5 + Math.random() * 0.4;
    return `${anim} ${duration}s ease-out forwards`;
  };
  
  // Responsive sizes
  const fontSize = isMobile ? 'clamp(14px, 4vw, 18px)' : 'clamp(16px, 1.5vw, 22px)';
  const maxWidth = isMobile ? '70vw' : '400px';
  
  if (!isActive || letters.length === 0) return null;
  
  return (
    <>
      {/* CSS Keyframes for letter animations */}
      <style>{`
        /* Enter Animations */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0); }
          50% { transform: scale(1.3); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-30px) rotate(-10deg); }
          to { opacity: 1; transform: translateY(0) rotate(0deg); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideLeft {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideRight {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(2); filter: blur(4px); }
          to { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @keyframes spinIn {
          from { opacity: 0; transform: rotate(-180deg) scale(0); }
          to { opacity: 1; transform: rotate(0deg) scale(1); }
        }
        @keyframes bounceIn {
          0% { opacity: 0; transform: translateY(-40px); }
          50% { opacity: 1; transform: translateY(10px); }
          70% { transform: translateY(-5px); }
          100% { transform: translateY(0); }
        }
        @keyframes flipIn {
          from { opacity: 0; transform: perspective(400px) rotateY(-90deg); }
          to { opacity: 1; transform: perspective(400px) rotateY(0deg); }
        }
        @keyframes glowIn {
          from { opacity: 0; filter: blur(10px) brightness(3); }
          to { opacity: 1; filter: blur(0) brightness(1); }
        }
        @keyframes typeIn {
          0% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        
        /* Exit Animations */
        @keyframes fadeOut {
          to { opacity: 0; }
        }
        @keyframes popOut {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes floatUp {
          to { opacity: 0; transform: translateY(-50px) rotate(15deg); }
        }
        @keyframes floatDown {
          to { opacity: 0; transform: translateY(50px) rotate(-15deg); }
        }
        @keyframes spinOut {
          to { opacity: 0; transform: rotate(360deg) scale(0); }
        }
        @keyframes shrinkOut {
          to { opacity: 0; transform: scale(0); }
        }
        @keyframes dissolve {
          to { opacity: 0; filter: blur(12px); transform: scale(1.2); }
        }
        @keyframes sparkleOut {
          0% { opacity: 1; filter: brightness(1); }
          50% { opacity: 1; filter: brightness(3) drop-shadow(0 0 10px currentColor); }
          100% { opacity: 0; filter: brightness(0.5); transform: scale(0.3); }
        }
        @keyframes driftAway {
          to { opacity: 0; transform: translate(${Math.random() > 0.5 ? '' : '-'}${30 + Math.random() * 40}px, ${Math.random() > 0.5 ? '' : '-'}${30 + Math.random() * 40}px) rotate(${Math.random() * 40 - 20}deg); }
        }
        @keyframes burstOut {
          0% { transform: scale(1); opacity: 1; }
          30% { transform: scale(2); opacity: 0.8; filter: brightness(2); }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes slideOut {
          to { opacity: 0; transform: translateX(${Math.random() > 0.5 ? '' : '-'}50px); }
        }
        @keyframes glitchOut {
          0% { opacity: 1; transform: translateX(0); }
          20% { opacity: 0.8; transform: translateX(-5px); }
          40% { opacity: 0.6; transform: translateX(5px); filter: hue-rotate(90deg); }
          60% { opacity: 0.4; transform: translateX(-3px); filter: hue-rotate(180deg); }
          80% { opacity: 0.2; transform: translateX(3px); filter: hue-rotate(270deg); }
          100% { opacity: 0; transform: translateX(0); }
        }
        
        /* Idle glow animation */
        @keyframes letterGlow {
          0%, 100% { filter: drop-shadow(0 0 3px currentColor); }
          50% { filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 12px currentColor); }
        }
        
        /* Gentle float */
        @keyframes letterFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
      
      <div
        className="fixed pointer-events-none"
        style={{
          ...position,
          zIndex: 9999,
          maxWidth,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0',
          justifyContent: direction.includes('left') ? 'flex-end' : 'flex-start',
        }}
        data-testid="magic-floating-text"
        data-direction={direction}
      >
        {letters.map((letter, index) => (
          <span
            key={`${thought?.id}-${index}`}
            style={{
              display: 'inline-block',
              color: letter.color,
              fontSize,
              fontWeight: letter.fontStyle.fontWeight,
              fontStyle: letter.fontStyle.fontStyle,
              textShadow: `
                0 0 10px ${letter.glowColor},
                0 0 20px ${letter.glowColor},
                0 0 30px ${letter.glowColor}40,
                0 2px 4px rgba(0,0,0,0.5)
              `,
              transform: `
                scale(${letter.scale})
                rotate(${letter.rotation}deg)
                translate(${letter.offsetX}px, ${letter.offsetY}px)
              `,
              opacity: letter.isVisible ? 1 : 0,
              animation: letter.isExiting
                ? getExitAnimation(letter.exitAnim)
                : letter.isVisible
                ? `${getEnterAnimation(letter.enterAnim, 0)}, letterGlow 2s ease-in-out infinite ${letter.delay * 0.5}ms, letterFloat 3s ease-in-out infinite ${letter.delay}ms`
                : 'none',
              whiteSpace: letter.char === ' ' ? 'pre' : 'normal',
              minWidth: letter.char === ' ' ? '0.3em' : 'auto',
              willChange: 'transform, opacity, filter',
              letterSpacing: '0.02em',
              lineHeight: 1.4,
            }}
            data-char={letter.char}
            data-enter-anim={letter.enterAnim}
            data-exit-anim={letter.exitAnim}
          >
            {letter.char}
          </span>
        ))}
      </div>
    </>
  );
}

export default MagicFloatingText;
