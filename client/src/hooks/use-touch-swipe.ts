import { useEffect, useRef, useState, useCallback } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

interface SwipeOptions {
  minSwipeDistance?: number;
  preventScroll?: boolean;
  enableHapticFeedback?: boolean;
  velocityThreshold?: number;
}

/**
 * Haptic Feedback Utility
 * Provides tactile feedback on supported devices
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const patterns = {
      light: 10,
      medium: 20,
      heavy: 30,
    };
    navigator.vibrate(patterns[type]);
  }
}

/**
 * Custom hook for detecting swipe gestures on mobile
 * Provides smooth touch interactions with velocity tracking and haptic feedback
 */
export function useSwipe(
  handlers: SwipeHandlers,
  options: SwipeOptions = {}
) {
  const {
    minSwipeDistance = 50,
    preventScroll = false,
    enableHapticFeedback = true,
    velocityThreshold = 0.3,
  } = options;

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEnd = useRef<{ x: number; y: number; time: number } | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    touchEnd.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      time: Date.now(),
    };

    if (preventScroll) {
      e.preventDefault();
    }
  }, [preventScroll]);

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchEnd.current) return;

    const distanceX = touchStart.current.x - touchEnd.current.x;
    const distanceY = touchStart.current.y - touchEnd.current.y;
    const timeDiff = touchEnd.current.time - touchStart.current.time;
    
    // Calculate velocity (pixels per millisecond)
    const velocityX = Math.abs(distanceX) / timeDiff;
    const velocityY = Math.abs(distanceY) / timeDiff;

    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY);

    if (isHorizontalSwipe) {
      if (Math.abs(distanceX) > minSwipeDistance || velocityX > velocityThreshold) {
        if (distanceX > 0) {
          enableHapticFeedback && triggerHaptic('light');
          handlers.onSwipeLeft?.();
        } else {
          enableHapticFeedback && triggerHaptic('light');
          handlers.onSwipeRight?.();
        }
      }
    } else {
      if (Math.abs(distanceY) > minSwipeDistance || velocityY > velocityThreshold) {
        if (distanceY > 0) {
          enableHapticFeedback && triggerHaptic('light');
          handlers.onSwipeUp?.();
        } else {
          enableHapticFeedback && triggerHaptic('light');
          handlers.onSwipeDown?.();
        }
      }
    }
  }, [handlers, minSwipeDistance, velocityThreshold, enableHapticFeedback]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}

/**
 * Hook for pull-to-refresh functionality
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isDragging.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;

      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;

      if (distance > 0 && distance < 150) {
        setPullDistance(distance);
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (!isDragging.current) return;

      if (pullDistance > 80) {
        setIsRefreshing(true);
        await onRefresh();
        setIsRefreshing(false);
      }

      setPullDistance(0);
      isDragging.current = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, pullDistance]);

  return { isRefreshing, pullDistance };
}

/**
 * Hook for detecting long press on mobile with haptic feedback
 */
export function useLongPress(
  onLongPress: () => void,
  options: { delay?: number; enableHaptic?: boolean } = {}
) {
  const { delay = 500, enableHaptic = true } = options;
  const [isLongPressing, setIsLongPressing] = useState(false);
  const timeout = useRef<NodeJS.Timeout>();
  const target = useRef<EventTarget | null>(null);

  const start = useCallback((e: TouchEvent) => {
    target.current = e.target;
    setIsLongPressing(true);
    timeout.current = setTimeout(() => {
      enableHaptic && triggerHaptic('medium');
      onLongPress();
      setIsLongPressing(false);
    }, delay);
  }, [onLongPress, delay, enableHaptic]);

  const clear = useCallback(() => {
    timeout.current && clearTimeout(timeout.current);
    setIsLongPressing(false);
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    isLongPressing,
  };
}

/**
 * Hook for swipe-to-delete/swipe-to-action functionality
 */
export function useSwipeToAction(
  onSwipeAction: () => void,
  options: { threshold?: number; direction?: 'left' | 'right' } = {}
) {
  const { threshold = 100, direction = 'left' } = options;
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const distance = direction === 'left' 
      ? startX.current - currentX 
      : currentX - startX.current;
    
    // Only allow positive swipe in the specified direction
    if (distance > 0) {
      setSwipeDistance(Math.min(distance, threshold * 1.5));
    }
  }, [isSwiping, direction, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (swipeDistance >= threshold) {
      triggerHaptic('medium');
      onSwipeAction();
    }
    setSwipeDistance(0);
    setIsSwiping(false);
  }, [swipeDistance, threshold, onSwipeAction]);

  const resetSwipe = useCallback(() => {
    setSwipeDistance(0);
    setIsSwiping(false);
  }, []);

  return {
    swipeDistance,
    isSwiping,
    swipeProgress: Math.min((swipeDistance / threshold) * 100, 100),
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    resetSwipe,
  };
}
