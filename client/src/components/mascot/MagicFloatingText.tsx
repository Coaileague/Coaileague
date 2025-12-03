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
import { useLocation } from 'wouter';
import type { Thought } from '@/lib/mascot/ThoughtManager';
import { THOUGHT_BUBBLE_BOUNDARY_CONFIG, PUBLIC_PAGE_PROMO_CONFIG } from '@/config/mascotConfig';

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

// Universal font style for mascot - BOLD for maximum visibility
const MASCOT_FONT_STYLE = { fontWeight: 800, fontStyle: 'normal' };

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
      scale: 0.95 + Math.random() * 0.1, // 0.95-1.05 (subtle variation)
      rotation: (Math.random() - 0.5) * 4, // -2 to 2 degrees (subtle)
      enterAnim: pickRandom(LETTER_ENTER_ANIMATIONS),
      exitAnim: pickRandom(LETTER_EXIT_ANIMATIONS),
      fontStyle: MASCOT_FONT_STYLE, // Universal consistent font
      delay: index * 40 + Math.random() * 15, // Staggered appear
      isVisible: false,
      isExiting: false,
      offsetX: (Math.random() - 0.5) * 1.5,
      offsetY: (Math.random() - 0.5) * 2,
    };
  });
};

// Calculate position to keep bubble ABOVE mascot without covering it
// mascotPos is in BOTTOM-RIGHT coordinates (distance from bottom-right corner)
// The bubble sits WELL ABOVE the mascot so Trinity and all emotes/transformations stay visible
const calculateAnchoredPosition = (
  mascotPos: { x: number; y: number },
  mascotSize: number,
  isMobile: boolean
): React.CSSProperties => {
  const config = THOUGHT_BUBBLE_BOUNDARY_CONFIG;
  const bubbleWidth = isMobile ? config.mobileMaxWidth : config.maxWidth;
  
  // Convert bottom-right coords to actual screen position
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  // Mascot center in screen coordinates
  const mascotCenterX = viewportWidth - mascotPos.x - (mascotSize / 2);
  const mascotTopY = viewportHeight - mascotPos.y - mascotSize;
  
  // CLEAR GAP: Bubble sits WELL ABOVE mascot - never overlap with mascot or emotes
  // Much larger gap to ensure mascot is never hidden by bubble background
  const clearanceGap = isMobile ? 55 : 70;
  const bubbleBottomY = mascotTopY - clearanceGap;
  
  // Center bubble horizontally on mascot center
  let bubbleLeftX = mascotCenterX - (bubbleWidth / 2);
  
  // Clamp to viewport bounds with minimal padding
  const padding = 4;
  bubbleLeftX = Math.max(padding, Math.min(bubbleLeftX, viewportWidth - bubbleWidth - padding));
  
  // Estimate bubble height based on content
  const estimatedBubbleHeight = isMobile ? 45 : 55;
  const bubbleTop = Math.max(padding, bubbleBottomY - estimatedBubbleHeight);
  
  return {
    position: 'fixed',
    top: bubbleTop,
    left: bubbleLeftX,
    maxWidth: bubbleWidth,
    minWidth: isMobile ? 120 : 140,
  };
};

export function MagicFloatingText({
  thought,
  mascotPosition,
  mascotSize,
  isMobile = false,
}: MagicFloatingTextProps) {
  const [letters, setLetters] = useState<LetterState[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [livePosition, setLivePosition] = useState<React.CSSProperties>({});
  const lastThoughtIdRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const animFrameRef = useRef<number | null>(null);
  
  // Choose color palette based on thought type or random
  const colorPalette = useMemo(() => {
    const palettes = Object.values(LETTER_COLORS);
    return pickRandom(palettes);
  }, [thought?.id]);
  
  // Real-time position tracking - bubble follows mascot smoothly
  useEffect(() => {
    if (!isActive) return;
    
    const updatePosition = () => {
      const newPos = calculateAnchoredPosition(mascotPosition, mascotSize, isMobile);
      setLivePosition(newPos);
      animFrameRef.current = requestAnimationFrame(updatePosition);
    };
    
    animFrameRef.current = requestAnimationFrame(updatePosition);
    
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive, mascotPosition.x, mascotPosition.y, mascotSize, isMobile]);
  
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
      
      // Initialize position immediately when thought becomes active
      const initialPos = calculateAnchoredPosition(mascotPosition, mascotSize, isMobile);
      setLivePosition(initialPos);
      
      // Stagger letter appearances
      newLetters.forEach((letter, index) => {
        const timer = window.setTimeout(() => {
          setLetters(prev => prev.map((l, i) => 
            i === index ? { ...l, isVisible: true } : l
          ));
        }, letter.delay);
        timersRef.current.push(timer);
      });
      
      // Calculate duration - MUCH longer for comfortable reading (20+ seconds)
      const now = Date.now();
      const textLength = thought.text.length;
      const baseDuration = 18000; // 18 seconds minimum for reading
      const readingTime = Math.max(baseDuration, textLength * 150); // 150ms per character
      // Use expiresAt if set, otherwise use generous reading time (max 25 seconds)
      const duration = thought.expiresAt ? Math.max(thought.expiresAt - now, readingTime) : Math.min(readingTime, 25000);
      const exitStartTime = Math.max(duration - 2500, 15000); // Start exit 2.5s before end, minimum 15s display
      
      // Start exit animations with stagger
      const exitTimer = window.setTimeout(() => {
        newLetters.forEach((_, index) => {
          const exitDelay = index * 40 + Math.random() * 60;
          const timer = window.setTimeout(() => {
            setLetters(prev => prev.map((l, i) => 
              i === index ? { ...l, isExiting: true } : l
            ));
          }, exitDelay);
          timersRef.current.push(timer);
        });
      }, exitStartTime);
      timersRef.current.push(exitTimer);
      
      // Hide completely after duration
      const hideTimer = window.setTimeout(() => {
        setIsActive(false);
        setLetters([]);
        lastThoughtIdRef.current = null;
      }, duration + 800);
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
  
  // Responsive font size - BIGGER, BOLDER, ALL CAPS for visibility
  const fontSize = isMobile ? 'clamp(14px, 3.8vw, 18px)' : 'clamp(16px, 1.5vw, 22px)';
  
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
        
        /* Subtle idle shimmer - very reduced for readability */
        @keyframes letterGlow {
          0%, 100% { filter: none; }
          50% { filter: brightness(1.1); }
        }
        
        /* Gentle float */
        @keyframes letterFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        
        /* Promo badge glow animation */
        @keyframes promoGlow {
          0%, 100% { 
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.3);
            transform: scale(1);
          }
          50% { 
            box-shadow: 0 3px 12px rgba(245, 158, 11, 0.6), 0 0 20px rgba(245, 158, 11, 0.5);
            transform: scale(1.02);
          }
        }
        
        /* CTA button pulse animation */
        @keyframes ctaPulse {
          0%, 100% { 
            box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4), 0 0 20px rgba(168, 85, 247, 0.2);
          }
          50% { 
            box-shadow: 0 4px 16px rgba(168, 85, 247, 0.6), 0 0 30px rgba(168, 85, 247, 0.4);
          }
        }
      `}</style>
      
      {/* Unified bubble container - clamped to mascot and follows in real-time */}
      <div
        className="pointer-events-none"
        style={{
          ...livePosition,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isMobile ? '2px' : '3px',
          transition: 'top 0.08s ease-out, left 0.08s ease-out',
        }}
        data-testid="magic-floating-text"
        data-anchored="true"
        data-follows-mascot="true"
      >
        {/* Discount badge for promo thoughts */}
        {thought?.showDiscount && (
          <div
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              fontSize: isMobile ? '8px' : '9px',
              fontWeight: 700,
              padding: isMobile ? '2px 6px' : '2px 8px',
              borderRadius: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              boxShadow: '0 1px 4px rgba(245, 158, 11, 0.4)',
              animation: 'promoGlow 2s ease-in-out infinite',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              whiteSpace: 'nowrap',
            }}
            data-testid="promo-discount-badge"
          >
            <span style={{ fontSize: isMobile ? '10px' : '11px' }}>&#127873;</span>
            {PUBLIC_PAGE_PROMO_CONFIG.discountLabel}
          </div>
        )}
        
        {/* Letter text container - very subtle background for visibility */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0',
            justifyContent: 'center',
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: isMobile ? '6px 10px' : '8px 12px',
            borderRadius: isMobile ? '10px' : '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.2)',
          }}
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
                textTransform: 'uppercase',
                textShadow: `
                  0 2px 4px rgba(0,0,0,0.8),
                  0 0 8px ${letter.glowColor}70,
                  0 0 16px ${letter.glowColor}40
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
                  ? `${getEnterAnimation(letter.enterAnim, 0)}, letterFloat 3s ease-in-out infinite ${letter.delay}ms`
                  : 'none',
                whiteSpace: letter.char === ' ' ? 'pre' : 'normal',
                minWidth: letter.char === ' ' ? '0.35em' : 'auto',
                willChange: 'transform, opacity, filter',
                letterSpacing: '0.05em',
                lineHeight: 1.5,
              }}
              data-char={letter.char}
              data-enter-anim={letter.enterAnim}
              data-exit-anim={letter.exitAnim}
            >
              {letter.char}
            </span>
          ))}
        </div>
        
        {/* CTA button for promo thoughts */}
        {thought?.ctaText && thought?.ctaLink && (
          <a
            href={thought.ctaLink}
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 10000,
              display: 'inline-flex',
              alignItems: 'center',
              gap: isMobile ? '3px' : '4px',
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              color: '#fff',
              fontSize: isMobile ? '9px' : '10px',
              fontWeight: 600,
              padding: isMobile ? '3px 8px' : '4px 10px',
              borderRadius: '12px',
              textDecoration: 'none',
              boxShadow: '0 2px 6px rgba(168, 85, 247, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              animation: 'ctaPulse 2s ease-in-out infinite',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 3px 8px rgba(168, 85, 247, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(168, 85, 247, 0.4)';
            }}
            data-testid="promo-cta-button"
          >
            {thought.ctaText}
            <svg width={isMobile ? "10" : "11"} height={isMobile ? "10" : "11"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </a>
        )}
      </div>
    </>
  );
}

export default MagicFloatingText;
