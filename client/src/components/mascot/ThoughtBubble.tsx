/**
 * ThoughtBubble - Enhanced Mascot Thought Display
 * 
 * Features:
 * - High contrast text visible on both light and dark backgrounds
 * - Multiple polished exit animations (fade, glide, typewriter, dissolve, etc.)
 * - Mobile-responsive sizing with proper scaling
 * - Glassmorphism styling with readable text
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Thought } from '@/lib/mascot/ThoughtManager';

// Exit animation types for variety
type ExitAnimation = 
  | 'fade'           // Simple fade out
  | 'glide-up'       // Slide up and fade
  | 'glide-down'     // Slide down and fade
  | 'glide-left'     // Slide left and fade
  | 'glide-right'    // Slide right and fade
  | 'shrink'         // Shrink to center
  | 'dissolve'       // Pixel dissolve effect
  | 'typewriter'     // Characters disappear one by one
  | 'word-cascade'   // Words fade out in sequence
  | 'pop'            // Quick pop out
  | 'float-away';    // Float up and rotate

// Enter animation types
type EnterAnimation = 
  | 'fade'
  | 'pop-in'
  | 'slide-up'
  | 'slide-down'
  | 'typewriter'
  | 'bounce';

interface ThoughtBubbleProps {
  thought: Thought | null;
  isMobile?: boolean;
  position?: {
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
  };
  onDismiss?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

// Pick random animation from array
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// All available exit animations
const EXIT_ANIMATIONS: ExitAnimation[] = [
  'fade', 'glide-up', 'glide-down', 'glide-left', 'glide-right',
  'shrink', 'dissolve', 'typewriter', 'word-cascade', 'pop', 'float-away'
];

// All available enter animations
const ENTER_ANIMATIONS: EnterAnimation[] = [
  'fade', 'pop-in', 'slide-up', 'slide-down', 'typewriter', 'bounce'
];

export function ThoughtBubble({ 
  thought, 
  isMobile = false, 
  position,
}: ThoughtBubbleProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [visibleWords, setVisibleWords] = useState<boolean[]>([]);
  const [visibleChars, setVisibleChars] = useState<boolean[]>([]);
  
  // Use refs to prevent re-render loops and track state across effects
  const lastThoughtIdRef = useRef<string | null>(null);
  const timersRef = useRef<{ exit?: NodeJS.Timeout; hide?: NodeJS.Timeout }>({});
  
  // Pick random animations for each new thought using refs
  const enterAnimRef = useRef<EnterAnimation>(pickRandom(ENTER_ANIMATIONS));
  const exitAnimRef = useRef<ExitAnimation>(pickRandom(EXIT_ANIMATIONS));
  
  // Handle thought changes with stable refs
  useEffect(() => {
    // Clear existing timers
    if (timersRef.current.exit) clearTimeout(timersRef.current.exit);
    if (timersRef.current.hide) clearTimeout(timersRef.current.hide);
    
    if (thought && thought.id !== lastThoughtIdRef.current) {
      // New thought - pick new animations
      lastThoughtIdRef.current = thought.id;
      enterAnimRef.current = pickRandom(ENTER_ANIMATIONS);
      exitAnimRef.current = pickRandom(EXIT_ANIMATIONS);
      
      setIsExiting(false);
      setIsVisible(true);
      
      // Initialize word/char visibility for typewriter effects
      const words = thought.text.split(' ');
      setVisibleWords(words.map(() => true));
      setVisibleChars(thought.text.split('').map(() => true));
      
      // Calculate duration from expiresAt or use default
      const now = Date.now();
      const duration = thought.expiresAt ? Math.max(thought.expiresAt - now, 2000) : 4000;
      const exitTime = Math.max(duration - 800, 500);
      
      // Start exit animation
      timersRef.current.exit = setTimeout(() => {
        setIsExiting(true);
        
        // Handle character/word animations
        const currentExitAnim = exitAnimRef.current;
        if (currentExitAnim === 'typewriter' && thought) {
          const chars = thought.text.split('');
          chars.forEach((_, i) => {
            setTimeout(() => {
              setVisibleChars(prev => {
                const next = [...prev];
                next[chars.length - 1 - i] = false;
                return next;
              });
            }, i * 30);
          });
        } else if (currentExitAnim === 'word-cascade' && thought) {
          const words = thought.text.split(' ');
          words.forEach((_, i) => {
            setTimeout(() => {
              setVisibleWords(prev => {
                const next = [...prev];
                next[i] = false;
                return next;
              });
            }, i * 100);
          });
        }
      }, exitTime);
      
      // Hide after full duration
      timersRef.current.hide = setTimeout(() => {
        setIsVisible(false);
      }, duration);
      
    } else if (!thought) {
      setIsVisible(false);
      lastThoughtIdRef.current = null;
    }
    
    return () => {
      if (timersRef.current.exit) clearTimeout(timersRef.current.exit);
      if (timersRef.current.hide) clearTimeout(timersRef.current.hide);
    };
  }, [thought?.id, thought?.text, thought?.expiresAt]);
  
  // Calculate responsive sizes
  const sizes = useMemo(() => ({
    fontSize: isMobile ? '0.75rem' : '0.875rem',
    maxWidth: isMobile ? '140px' : '220px',
    padding: isMobile ? '6px 10px' : '8px 14px',
    iconSize: isMobile ? '1rem' : '1.25rem',
    borderRadius: isMobile ? '12px' : '16px',
  }), [isMobile]);
  
  // Get enter animation styles
  const getEnterStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      opacity: 1,
      transform: 'translateY(0) translateX(0) scale(1) rotate(0deg)',
    };
    
    switch (enterAnimRef.current) {
      case 'pop-in':
        return { ...base, animation: 'thoughtPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' };
      case 'slide-up':
        return { ...base, animation: 'thoughtSlideUp 0.35s ease-out' };
      case 'slide-down':
        return { ...base, animation: 'thoughtSlideDown 0.35s ease-out' };
      case 'bounce':
        return { ...base, animation: 'thoughtBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' };
      case 'typewriter':
        return { ...base, animation: 'thoughtFade 0.2s ease-out' };
      default:
        return { ...base, animation: 'thoughtFade 0.3s ease-out' };
    }
  };
  
  // Get exit animation styles
  const getExitStyles = (): React.CSSProperties => {
    if (!isExiting) return {};
    
    switch (exitAnimRef.current) {
      case 'glide-up':
        return { animation: 'thoughtGlideUp 0.5s ease-in forwards' };
      case 'glide-down':
        return { animation: 'thoughtGlideDown 0.5s ease-in forwards' };
      case 'glide-left':
        return { animation: 'thoughtGlideLeft 0.5s ease-in forwards' };
      case 'glide-right':
        return { animation: 'thoughtGlideRight 0.5s ease-in forwards' };
      case 'shrink':
        return { animation: 'thoughtShrink 0.4s ease-in forwards' };
      case 'dissolve':
        return { animation: 'thoughtDissolve 0.6s ease-out forwards' };
      case 'pop':
        return { animation: 'thoughtPop 0.25s ease-in forwards' };
      case 'float-away':
        return { animation: 'thoughtFloatAway 0.7s ease-out forwards' };
      case 'typewriter':
      case 'word-cascade':
        return { opacity: 1 }; // Handled by character/word visibility
      default:
        return { animation: 'thoughtFade 0.4s ease-out reverse forwards' };
    }
  };
  
  // Render text with typewriter/word-cascade effects
  const renderText = () => {
    if (!thought) return null;
    
    if (isExiting && exitAnimRef.current === 'typewriter') {
      return (
        <span className="inline">
          {thought.text.split('').map((char, i) => (
            <span
              key={i}
              style={{
                opacity: visibleChars[i] ? 1 : 0,
                transition: 'opacity 0.1s ease-out',
              }}
            >
              {char}
            </span>
          ))}
        </span>
      );
    }
    
    if (isExiting && exitAnimRef.current === 'word-cascade') {
      return (
        <span className="inline">
          {thought.text.split(' ').map((word, i) => (
            <span
              key={i}
              style={{
                opacity: visibleWords[i] ? 1 : 0,
                transform: visibleWords[i] ? 'translateY(0)' : 'translateY(-10px)',
                transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
                display: 'inline-block',
                marginRight: '0.25em',
              }}
            >
              {word}
            </span>
          ))}
        </span>
      );
    }
    
    return thought.text;
  };
  
  if (!isVisible || !thought) return null;
  
  return (
    <>
      {/* CSS Keyframes for animations */}
      <style>{`
        @keyframes thoughtFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes thoughtPopIn {
          from { opacity: 0; transform: scale(0.5); }
          50% { transform: scale(1.1); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes thoughtSlideUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes thoughtSlideDown {
          from { opacity: 0; transform: translateY(-15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes thoughtBounce {
          from { opacity: 0; transform: translateY(20px) scale(0.8); }
          60% { transform: translateY(-5px) scale(1.05); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes thoughtGlideUp {
          to { opacity: 0; transform: translateY(-25px); }
        }
        @keyframes thoughtGlideDown {
          to { opacity: 0; transform: translateY(25px); }
        }
        @keyframes thoughtGlideLeft {
          to { opacity: 0; transform: translateX(-30px); }
        }
        @keyframes thoughtGlideRight {
          to { opacity: 0; transform: translateX(30px); }
        }
        @keyframes thoughtShrink {
          to { opacity: 0; transform: scale(0.3); }
        }
        @keyframes thoughtDissolve {
          0% { opacity: 1; filter: blur(0px); }
          100% { opacity: 0; filter: blur(8px); }
        }
        @keyframes thoughtPop {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes thoughtFloatAway {
          to { opacity: 0; transform: translateY(-40px) rotate(10deg) scale(0.8); }
        }
        @keyframes emoticonPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
      
      <div
        className="absolute pointer-events-none"
        style={{
          ...position,
          zIndex: 100,
          ...getEnterStyles(),
          ...getExitStyles(),
        }}
        data-testid="thought-bubble"
        data-exit-animation={exitAnimRef.current}
        data-enter-animation={enterAnimRef.current}
      >
        {/* Glassmorphism bubble container with high contrast */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.95) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: sizes.borderRadius,
            padding: sizes.padding,
            maxWidth: sizes.maxWidth,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: `
              0 4px 24px rgba(0, 0, 0, 0.35),
              0 2px 8px rgba(0, 0, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.15)
            `,
          }}
        >
          <div 
            className="flex items-center gap-2"
            style={{
              flexDirection: isMobile ? 'column' : 'row',
              textAlign: isMobile ? 'center' : 'left',
            }}
          >
            {/* Emoticon with animation */}
            <span
              style={{
                fontSize: sizes.iconSize,
                flexShrink: 0,
                animation: isExiting ? 'none' : 'emoticonPulse 2s ease-in-out infinite',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
              }}
            >
              {thought.emoticon}
            </span>
            
            {/* Text with high contrast - visible on any background */}
            <span
              style={{
                fontSize: sizes.fontSize,
                fontWeight: 700,
                color: '#ffffff',
                textShadow: `
                  0 1px 2px rgba(0, 0, 0, 0.6),
                  0 0 10px rgba(0, 0, 0, 0.4)
                `,
                lineHeight: 1.4,
                letterSpacing: '0.02em',
                wordBreak: 'break-word',
              }}
            >
              {renderText()}
            </span>
          </div>
        </div>
        
        {/* Subtle glow effect */}
        <div
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: sizes.borderRadius,
            background: 'radial-gradient(ellipse at center, rgba(168, 85, 247, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        />
      </div>
    </>
  );
}

// Alternative styles for different contexts
export const THOUGHT_BUBBLE_STYLES = {
  dark: {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.95) 100%)',
    textColor: '#ffffff',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  light: {
    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(241, 245, 249, 0.95) 100%)',
    textColor: '#1e293b',
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  accent: {
    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.9) 0%, rgba(139, 92, 246, 0.9) 100%)',
    textColor: '#ffffff',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  holiday: {
    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.85) 0%, rgba(22, 163, 74, 0.85) 100%)',
    textColor: '#ffffff',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
};

export default ThoughtBubble;
