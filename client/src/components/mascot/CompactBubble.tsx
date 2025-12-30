/**
 * CompactBubble - Polished, minimal Trinity chat bubble
 * 
 * Features:
 * - Small, non-intrusive design
 * - Summarizes messages (max 1-2 lines)
 * - Links to Trinity Insights page for full message history
 * - Smooth animations, elegant styling
 * - Auto-dismisses after 6 seconds
 * - Doesn't block content
 */

import { useState, useEffect, memo, useRef, useCallback } from 'react';
import { Link } from 'wouter';
import { X, Sparkles } from 'lucide-react';
import { triggerHaptic } from '@/hooks/use-touch-swipe';
import type { Thought } from '@/lib/mascot/ThoughtManager';
import type { MascotMode } from '@/config/mascotConfig';

interface CompactBubbleProps {
  thought: Thought | null;
  mascotPosition: { x: number; y: number };
  mascotSize: number;
  mode?: MascotMode;
  onDismiss: () => void;
}

const MODE_COLORS: Record<MascotMode, { bg: string; border: string; text: string; accent: string }> = {
  IDLE: { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-900 dark:text-blue-100', accent: 'text-blue-600 dark:text-blue-400' },
  THINKING: { bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-900 dark:text-purple-100', accent: 'text-purple-600 dark:text-purple-400' },
  ANALYZING: { bg: 'bg-indigo-50 dark:bg-indigo-950', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-900 dark:text-indigo-100', accent: 'text-indigo-600 dark:text-indigo-400' },
  SEARCHING: { bg: 'bg-emerald-50 dark:bg-emerald-950', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-900 dark:text-emerald-100', accent: 'text-emerald-600 dark:text-emerald-400' },
  SUCCESS: { bg: 'bg-pink-50 dark:bg-pink-950', border: 'border-pink-200 dark:border-pink-800', text: 'text-pink-900 dark:text-pink-100', accent: 'text-pink-600 dark:text-pink-400' },
  ERROR: { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200 dark:border-red-800', text: 'text-red-900 dark:text-red-100', accent: 'text-red-600 dark:text-red-400' },
  LISTENING: { bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-900 dark:text-amber-100', accent: 'text-amber-600 dark:text-amber-400' },
  UPLOADING: { bg: 'bg-cyan-50 dark:bg-cyan-950', border: 'border-cyan-200 dark:border-cyan-800', text: 'text-cyan-900 dark:text-cyan-100', accent: 'text-cyan-600 dark:text-cyan-400' },
  CELEBRATING: { bg: 'bg-yellow-50 dark:bg-yellow-950', border: 'border-yellow-200 dark:border-yellow-800', text: 'text-yellow-900 dark:text-yellow-100', accent: 'text-yellow-600 dark:text-yellow-400' },
  ADVISING: { bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-200 dark:border-green-800', text: 'text-green-900 dark:text-green-100', accent: 'text-green-600 dark:text-green-400' },
  HOLIDAY: { bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200 dark:border-red-800', text: 'text-red-900 dark:text-red-100', accent: 'text-red-600 dark:text-red-400' },
  GREETING: { bg: 'bg-pink-50 dark:bg-pink-950', border: 'border-pink-200 dark:border-pink-800', text: 'text-pink-900 dark:text-pink-100', accent: 'text-pink-600 dark:text-pink-400' },
  CODING: { bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-200 dark:border-green-800', text: 'text-green-900 dark:text-green-100', accent: 'text-green-600 dark:text-green-400' },
};

// Summarize text to first sentence or max 80 chars
const summarizeText = (text: string): string => {
  if (!text) return '';
  const maxLength = 80;
  const firstSentence = text.split(/[.!?]/)[0].trim();
  
  if (firstSentence.length > maxLength) {
    return firstSentence.substring(0, maxLength) + '...';
  }
  
  return firstSentence || text.substring(0, maxLength) + '...';
};

export const CompactBubble = memo(function CompactBubble({
  thought,
  mascotPosition,
  mascotSize,
  mode = 'IDLE',
  onDismiss,
}: CompactBubbleProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [isDismissing, setIsDismissing] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const colors = MODE_COLORS[mode];
  
  // Swipe threshold for dismissal (in pixels)
  const SWIPE_THRESHOLD = 60;
  const VELOCITY_THRESHOLD = 0.3;
  
  // Handle swipe dismiss
  const handleSwipeDismiss = useCallback((dirX: number, dirY: number) => {
    if (isDismissing) return;
    setIsDismissing(true);
    triggerHaptic('light');
    // Animate off in swipe direction
    setSwipeOffset({ x: dirX * 300, y: dirY * 300 });
    setIsVisible(false);
    setTimeout(() => {
      setShouldRender(false);
      onDismiss();
    }, 300);
  }, [isDismissing, onDismiss]);
  
  // Native touch event handlers for reliable mobile swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isDismissing) return;
    
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;
    setSwipeOffset({ x: deltaX, y: deltaY });
  }, [isDismissing]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isDismissing) return;
    
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    const timeDiff = Date.now() - touchStartRef.current.time;
    
    // Calculate velocity
    const velocityX = Math.abs(deltaX) / timeDiff;
    const velocityY = Math.abs(deltaY) / timeDiff;
    const totalVelocity = Math.max(velocityX, velocityY);
    
    const totalMovement = Math.abs(deltaX) + Math.abs(deltaY);
    
    // Dismiss if moved far enough OR fast swipe
    if (totalMovement > SWIPE_THRESHOLD || totalVelocity > VELOCITY_THRESHOLD) {
      const dirX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
      const dirY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
      handleSwipeDismiss(dirX, dirY);
    } else {
      // Snap back
      setSwipeOffset({ x: 0, y: 0 });
    }
    
    touchStartRef.current = null;
  }, [isDismissing, handleSwipeDismiss]);

  // Auto-dismiss with comfortable reading time based on text length
  useEffect(() => {
    if (!thought) {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }

    setShouldRender(true);
    setTimeout(() => setIsVisible(true), 50);

    // Calculate reading time: use thought's expiresAt if available (set by ThoughtManager)
    // Otherwise use generous fallback: 400ms per character, minimum 30 seconds, max 60 seconds
    // User feedback: thoughts were rotating too fast, so we doubled the reading time
    const textLength = thought.text?.length || 0;
    const fallbackReadingTime = Math.min(Math.max(textLength * 400, 30000), 60000);
    
    // Prefer ThoughtManager's calculated expiry time if available
    const readingTime = thought.expiresAt ? 
      Math.max(thought.expiresAt - Date.now(), 25000) : fallbackReadingTime;
    
    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        setShouldRender(false);
        onDismiss();
      }, 300);
    }, readingTime);

    return () => clearTimeout(dismissTimer);
  }, [thought, onDismiss]);

  if (!shouldRender) return null;

  // Calculate position - small bubble near mascot, doesn't block content
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  const mascotCenterX = viewportWidth - mascotPosition.x - (mascotSize / 2);
  const mascotTopY = viewportHeight - mascotPosition.y - mascotSize;
  
  let bubbleLeft = Math.min(mascotCenterX + mascotSize + 12, viewportWidth - 280);
  let bubbleTop = Math.max(mascotTopY - 10, 20);
  
  bubbleLeft = Math.max(12, bubbleLeft);

  return (
    <div
      ref={bubbleRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`fixed pointer-events-auto trinity-bubble ${
        isVisible && !isDismissing ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      data-mascot="compact-bubble"
      data-trinity="true"
      style={{
        left: `${bubbleLeft}px`,
        top: `${bubbleTop}px`,
        zIndex: 9989,
        maxWidth: '280px',
        transform: `translate(${swipeOffset.x}px, ${swipeOffset.y}px)`,
        transition: isDismissing ? 'all 0.3s ease-out' : (swipeOffset.x === 0 && swipeOffset.y === 0 ? 'all 0.3s ease-out' : 'none'),
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'pan-y',
      }}
      data-testid="compact-bubble"
    >
      <div
        className={`rounded-lg border backdrop-blur-sm shadow-lg ${colors.bg} ${colors.border} border px-3 py-2`}
      >
        {/* Header with Trinity icon and close button */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className={`flex items-center gap-1.5 ${colors.accent}`}>
            <Sparkles size={14} className="shrink-0" />
            <span className="text-xs font-semibold">Trinity</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsVisible(false);
              setTimeout(() => {
                setShouldRender(false);
                onDismiss();
              }, 300);
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsVisible(false);
              setTimeout(() => {
                setShouldRender(false);
                onDismiss();
              }, 300);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsVisible(false);
                setTimeout(() => {
                  setShouldRender(false);
                  onDismiss();
                }, 300);
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsVisible(false);
              setTimeout(() => {
                setShouldRender(false);
                onDismiss();
              }, 300);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            className={`flex items-center justify-center p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 active:bg-black/20 transition-colors ${colors.text}`}
            style={{ 
              touchAction: 'manipulation', 
              minWidth: '32px', 
              minHeight: '32px',
              zIndex: 10002,
              position: 'relative',
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
            data-testid="button-close-bubble"
          >
            <X size={18} />
          </div>
        </div>

        {/* Summarized message */}
        <p className={`text-xs leading-snug ${colors.text}`}>
          {summarizeText(thought?.text || '')}
        </p>

        {/* Link to full insights */}
        {thought && (
          <Link
            href="/trinity-insights"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = '/trinity-insights';
            }}
            className={`inline-block mt-1.5 text-xs font-medium ${colors.accent} hover:underline`}
            data-testid="link-trinity-insights"
          >
            View all insights →
          </Link>
        )}
      </div>
    </div>
  );
});

export default CompactBubble;
