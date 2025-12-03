/**
 * MascotThoughtBubble - Readable thought bubble that stays near mascot
 * 
 * Features:
 * - Stays positioned near mascot (not scattered)
 * - Glassmorphism background for visibility on any background
 * - Proper text contrast on light and dark backgrounds
 * - Longer display time for reading
 * - Smooth enter/exit animations
 * - Mobile responsive
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Thought } from '@/lib/mascot/ThoughtManager';

interface MascotThoughtBubbleProps {
  thought: Thought | null;
  mascotPosition: { x: number; y: number };
  mascotSize: number;
  isMobile?: boolean;
}

export function MascotThoughtBubble({
  thought,
  mascotPosition,
  mascotSize,
  isMobile = false,
}: MascotThoughtBubbleProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [displayedThought, setDisplayedThought] = useState<Thought | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  // Calculate position relative to mascot
  const bubblePosition = useMemo(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    
    // Mascot uses bottom-right positioning
    const mascotRight = mascotPosition.x;
    const mascotBottom = mascotPosition.y;
    
    // Convert to screen coordinates
    const mascotScreenX = viewportWidth - mascotRight - mascotSize / 2;
    const mascotScreenY = viewportHeight - mascotBottom - mascotSize / 2;
    
    // Bubble sizing
    const bubbleMaxWidth = isMobile ? 200 : 280;
    const bubbleMargin = isMobile ? 10 : 15;
    
    // Default: position above and to the left of mascot
    let style: React.CSSProperties = {
      position: 'fixed',
      bottom: mascotBottom + mascotSize + bubbleMargin,
      right: mascotRight - 20,
      maxWidth: bubbleMaxWidth,
    };
    
    // If mascot is near top, show bubble below
    if (mascotScreenY < 150) {
      style = {
        position: 'fixed',
        top: viewportHeight - mascotBottom + bubbleMargin,
        right: mascotRight - 20,
        maxWidth: bubbleMaxWidth,
      };
    }
    
    // If mascot is near left edge (mascotScreenX is small), shift bubble more right
    // mascotScreenX represents the mascot's X position from left side of screen
    if (mascotScreenX < 200) {
      // Mascot is on left side, ensure bubble doesn't go off-screen
      style.right = Math.max(10, mascotRight - bubbleMaxWidth);
    }
    
    // Ensure bubble stays on screen
    if (typeof style.right === 'number' && style.right < 10) {
      style.right = 10;
    }
    
    return style;
  }, [mascotPosition.x, mascotPosition.y, mascotSize, isMobile]);

  // Handle thought changes
  useEffect(() => {
    // Clear existing timers
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (thought) {
      setDisplayedThought(thought);
      setIsExiting(false);
      setIsVisible(true);
      
      // Calculate display duration - minimum 5 seconds, scales with text length
      const textLength = thought.text.length;
      const baseDuration = 5000; // 5 seconds minimum
      const readingTime = Math.max(baseDuration, textLength * 80); // ~80ms per character
      const maxDuration = 12000; // Max 12 seconds
      const displayDuration = Math.min(readingTime, maxDuration);
      
      // Start exit animation before hiding
      exitTimerRef.current = window.setTimeout(() => {
        setIsExiting(true);
      }, displayDuration - 500);
      
      // Hide completely after animation
      hideTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
        setDisplayedThought(null);
      }, displayDuration);
    } else {
      setIsExiting(true);
      hideTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
        setDisplayedThought(null);
      }, 500);
    }

    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [thought?.id]);

  if (!isVisible || !displayedThought) return null;

  return (
    <>
      <style>{`
        @keyframes bubbleEnter {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes bubbleExit {
          from {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to {
            opacity: 0;
            transform: scale(0.9) translateY(-5px);
          }
        }
        @keyframes bubblePulse {
          0%, 100% {
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 
                        0 0 40px rgba(147, 51, 234, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.8);
          }
          50% {
            box-shadow: 0 4px 28px rgba(0, 0, 0, 0.15), 
                        0 0 50px rgba(147, 51, 234, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.9);
          }
        }
      `}</style>
      
      <div
        style={{
          ...bubblePosition,
          zIndex: 10000,
          pointerEvents: 'none',
        }}
        data-testid="mascot-thought-bubble"
      >
        {/* Main bubble - Light glassmorphism */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.92) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: isMobile ? '14px' : '16px',
            padding: isMobile ? '12px 14px' : '14px 18px',
            border: '1px solid rgba(147, 51, 234, 0.4)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12), 0 0 40px rgba(147, 51, 234, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            animation: isExiting 
              ? 'bubbleExit 0.4s ease-out forwards' 
              : 'bubbleEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, bubblePulse 3s ease-in-out infinite 0.4s',
          }}
        >
          {/* Message text - dark for contrast on light background */}
          <p
            style={{
              margin: 0,
              fontSize: isMobile ? '13px' : '14px',
              lineHeight: 1.5,
              color: '#1e293b',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            {displayedThought.text}
          </p>
          
          {/* Emoticon if present */}
          {displayedThought.emoticon && (
            <div
              style={{
                marginTop: '6px',
                fontSize: isMobile ? '16px' : '18px',
                opacity: 0.9,
              }}
            >
              {displayedThought.emoticon}
            </div>
          )}
        </div>
        
        {/* Tail pointing toward mascot */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            right: '20px',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '10px solid rgba(248, 250, 252, 0.95)',
            filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
          }}
        />
      </div>
    </>
  );
}

export default MascotThoughtBubble;
