/**
 * Swipe-to-Delete Component
 * iOS-style swipe left to delete with visual feedback
 * Uses native passive event listeners to NOT block vertical scrolling
 * 
 * Key design decisions:
 * - touchstart is passive to not block scroll detection
 * - Direction lock happens early (8px) to quickly release vertical gestures
 * - Once vertical is detected, we completely stop tracking to let scroll work
 * - Horizontal swipes get visual feedback immediately
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/haptics";

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: React.ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export function SwipeToDelete({ 
  onDelete, 
  children, 
  threshold = 100,
  disabled = false 
}: SwipeToDeleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  // Refs for touch state (don't cause re-renders)
  const startX = useRef(0);
  const startY = useRef(0);
  const currentDistance = useRef(0);
  const isTracking = useRef(false);
  const directionLocked = useRef<'horizontal' | 'vertical' | null>(null);
  const actionTriggered = useRef(false);
  const lastHapticAt = useRef(0);
  
  // Lower thresholds for more responsive detection
  const lockThreshold = 8; // Pixels before locking direction (was 15)
  const minVisualDistance = 5; // Start showing visual feedback early

  const resetSwipe = useCallback(() => {
    currentDistance.current = 0;
    isTracking.current = false;
    directionLocked.current = null;
    actionTriggered.current = false;
    setSwipeDistance(0);
    setIsSwiping(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      currentDistance.current = 0;
      isTracking.current = true;
      directionLocked.current = null;
      actionTriggered.current = false;
      lastHapticAt.current = 0;
      setIsSwiping(false);
      setSwipeDistance(0);
    };

    const handleTouchMove = (e: TouchEvent) => {
      // If not tracking or already locked to vertical, do nothing - let scroll happen
      if (!isTracking.current || directionLocked.current === 'vertical') {
        return;
      }
      
      const touch = e.touches[0];
      const deltaX = startX.current - touch.clientX; // Left swipe = positive
      const deltaY = Math.abs(touch.clientY - startY.current);
      const absDeltaX = Math.abs(deltaX);
      
      // Determine direction lock if not yet locked
      if (!directionLocked.current) {
        // Need to move enough to determine direction
        if (absDeltaX > lockThreshold || deltaY > lockThreshold) {
          if (deltaY > absDeltaX * 0.8) {
            // Vertical - stop tracking completely to allow native scroll
            directionLocked.current = 'vertical';
            isTracking.current = false;
            return;
          } else if (absDeltaX > deltaY) {
            // Horizontal - we'll handle this swipe
            directionLocked.current = 'horizontal';
          }
        } else {
          // Not enough movement yet - don't do anything, let browser decide
          return;
        }
      }
      
      // Only process if we're locked to horizontal AND swiping left (positive deltaX)
      if (directionLocked.current === 'horizontal' && deltaX > minVisualDistance) {
        // Prevent scroll while swiping horizontally
        e.preventDefault();
        
        const clampedDistance = Math.min(deltaX, threshold * 1.3);
        currentDistance.current = clampedDistance;
        setSwipeDistance(clampedDistance);
        setIsSwiping(true);
        
        // Haptic feedback with debounce
        const now = Date.now();
        if (clampedDistance >= threshold * 0.5 && lastHapticAt.current < threshold * 0.5) {
          haptics.light();
          lastHapticAt.current = clampedDistance;
        }
        if (clampedDistance >= threshold && lastHapticAt.current < threshold) {
          haptics.medium();
          lastHapticAt.current = clampedDistance;
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isTracking.current && directionLocked.current !== 'horizontal') {
        resetSwipe();
        return;
      }
      
      const finalDistance = currentDistance.current;
      const wasHorizontalSwipe = directionLocked.current === 'horizontal';
      
      // Trigger action if passed threshold on horizontal swipe
      if (wasHorizontalSwipe && finalDistance >= threshold && !actionTriggered.current) {
        actionTriggered.current = true;
        haptics.medium();
        
        // Brief delay for visual feedback before action
        setTimeout(() => {
          onDelete();
          resetSwipe();
        }, 150);
      } else {
        // Animate back
        resetSwipe();
      }
    };

    const handleTouchCancel = () => {
      resetSwipe();
    };

    // Use passive: true for touchstart so it doesn't block scroll detection
    // touchmove needs passive: false because we might preventDefault for horizontal swipes
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [disabled, threshold, onDelete, resetSwipe]);

  if (disabled) {
    return <>{children}</>;
  }

  // Visual feedback thresholds
  const swipeProgress = (swipeDistance / threshold) * 100;
  const isStarting = swipeProgress >= 20;
  const isNearThreshold = swipeProgress >= 70;
  const hasPassedThreshold = swipeProgress >= 100;

  return (
    <div 
      ref={containerRef}
      className="relative rounded-lg" 
      data-testid="swipe-container"
    >
      {/* Delete Action Background - reveals as you swipe */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 flex items-center justify-end pr-4 transition-colors duration-150 rounded-r-lg",
          hasPassedThreshold 
            ? "bg-green-500" 
            : isNearThreshold 
              ? "bg-destructive" 
              : isStarting
                ? "bg-destructive/80"
                : "bg-destructive/50"
        )}
        style={{ 
          width: `${Math.max(swipeDistance, 0)}px`,
          minWidth: swipeDistance > 10 ? '50px' : '0px'
        }}
      >
        {hasPassedThreshold ? (
          <Check className="h-5 w-5 text-white animate-pulse" />
        ) : (
          <Trash2 
            className={cn(
              "h-5 w-5 text-white transition-transform duration-150",
              isNearThreshold && "scale-125",
              isStarting && !isNearThreshold && "scale-100"
            )} 
          />
        )}
      </div>

      {/* Swipeable Content */}
      <div
        className={cn(
          "relative bg-card rounded-lg",
          !isSwiping && "transition-transform duration-200 ease-out"
        )}
        style={{ 
          transform: `translateX(-${swipeDistance}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
