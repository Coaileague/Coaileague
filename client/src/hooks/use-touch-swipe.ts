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
 * Universal Pull-to-Refresh Hook v3.0
 * Tuned to match Android native PTR behavior.
 *
 * Key design choices:
 * - Direction lock at 8px (matches Android ViewConfiguration.touchSlop)
 * - NO deadzone — indicator starts moving immediately after lock
 * - Rubber band from the very first pixel (logarithmic curve, not linear)
 * - Trigger at 64px effective distance (matches Android SwipeRefreshLayout)
 * - Max visual pull caps at 120px (overscroll feels bounded)
 * - Direction ratio 1.7x (not 3x — too strict kills usability)
 * - Haptic at threshold crossing + on trigger
 * - Spring-back uses CSS transition (not JS setTimeout)
 * - Container gets touch-action: pan-x when PTR is eligible
 * - overscroll-behavior: none on container to prevent browser PTR
 */
/**
 * Module-level singleton guard.
 * Only ONE PTR instance may attach listeners to #main-content at a time.
 * Prevents duplicate event stacking when components re-render or nest.
 */
let _ptrOwner: string | null = null;

export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  enabled = true,
) {
  const instanceId = useRef<string>(Math.random().toString(36).slice(2));

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isSnappingBack, setIsSnappingBack] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isRefreshingRef = useRef(false);

  const startY = useRef(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const directionLocked = useRef<'vertical' | 'horizontal' | null>(null);
  const rawPullRef = useRef(0);
  const effectivePullRef = useRef(0);
  const wasAtTopOnStart = useRef(false);
  const hasTriggeredHaptic = useRef(false);
  const isPullingDown = useRef(false);

  const TOUCH_SLOP = 12;
  const DIRECTION_RATIO = 2.2;
  const TRIGGER_THRESHOLD = 120;
  const MAX_VISUAL_PULL = 160;
  const PTR_SETTLE_DELAY = 400;

  const applyRubberBand = useCallback((raw: number): number => {
    if (raw <= 0) return 0;
    const maxRaw = 300;
    const clamped = Math.min(raw, maxRaw);
    return MAX_VISUAL_PULL * (1 - Math.exp(-clamped / (MAX_VISUAL_PULL * 0.8)));
  }, []);

  const getScrollContainer = useCallback((): HTMLElement | null => {
    return document.getElementById('mobile-scroll-container') || document.getElementById('main-content');
  }, []);

  useEffect(() => {
    // Hard gate: do nothing when disabled
    if (!enabled) return;

    const id = instanceId.current;

    // Claim the singleton slot — bail if another instance already owns it
    if (_ptrOwner !== null && _ptrOwner !== id) {
      return;
    }
    _ptrOwner = id;

    const scrollEl = getScrollContainer();
    if (!scrollEl) {
      _ptrOwner = null;
      return;
    }

    scrollEl.style.overscrollBehaviorY = 'contain';

    // Track last scroll event so we can require a settle period before arming PTR
    let lastScrollTime = 0;
    const onScroll = () => { lastScrollTime = Date.now(); };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    const handleTouchStart = (e: globalThis.TouchEvent) => {
      if (isRefreshingRef.current) return;

      const isAtTop = scrollEl.scrollTop <= 1;
      wasAtTopOnStart.current = isAtTop;

      // Require page to have been stationary for PTR_SETTLE_DELAY ms.
      // This stops inertial-scroll overshoot from immediately arming PTR.
      const settledAtTop = isAtTop && (Date.now() - lastScrollTime >= PTR_SETTLE_DELAY);

      if (settledAtTop) {
        startY.current = e.touches[0].clientY;
        startX.current = e.touches[0].clientX;
        isDragging.current = true;
        directionLocked.current = null;
        rawPullRef.current = 0;
        effectivePullRef.current = 0;
        hasTriggeredHaptic.current = false;
        isPullingDown.current = false;
        setIsSnappingBack(false);
      }
    };

    const handleTouchMove = (e: globalThis.TouchEvent) => {
      if (!isDragging.current || isRefreshingRef.current || !wasAtTopOnStart.current) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - startY.current;
      const deltaX = Math.abs(currentX - startX.current);
      const absDeltaY = Math.abs(deltaY);

      if (!directionLocked.current) {
        if (absDeltaY < TOUCH_SLOP && deltaX < TOUCH_SLOP) return;

        if (deltaY > 0 && absDeltaY > deltaX * DIRECTION_RATIO) {
          directionLocked.current = 'vertical';
          isPullingDown.current = true;
        } else {
          directionLocked.current = 'horizontal';
          isDragging.current = false;
          return;
        }
      }

      if (directionLocked.current !== 'vertical') return;

      if (deltaY <= 0) {
        if (isPullingDown.current) {
          setPullProgress(0);
          rawPullRef.current = 0;
          effectivePullRef.current = 0;
          isDragging.current = false;
          isPullingDown.current = false;
          directionLocked.current = null;
        }
        return;
      }

      if (scrollEl.scrollTop > 1) {
        isDragging.current = false;
        setPullProgress(0);
        rawPullRef.current = 0;
        effectivePullRef.current = 0;
        isPullingDown.current = false;
        directionLocked.current = null;
        return;
      }

      const rawPull = deltaY - TOUCH_SLOP;
      if (rawPull > 0) {
        rawPullRef.current = rawPull;
        const effective = applyRubberBand(rawPull);
        effectivePullRef.current = effective;
        setPullProgress(effective);

        if (effective >= TRIGGER_THRESHOLD && !hasTriggeredHaptic.current) {
          hasTriggeredHaptic.current = true;
          triggerHaptic('medium');
        } else if (effective < TRIGGER_THRESHOLD && hasTriggeredHaptic.current) {
          hasTriggeredHaptic.current = false;
        }

        // NOTE: e.preventDefault() removed — passive listener + overscroll-behavior:contain
        // on the scroll container suppresses native PTR without blocking scroll.
      }
    };

    const resetTouchState = () => {
      rawPullRef.current = 0;
      effectivePullRef.current = 0;
      isDragging.current = false;
      isPullingDown.current = false;
      directionLocked.current = null;
      wasAtTopOnStart.current = false;
    };

    const handleTouchEnd = async () => {
      if (!isDragging.current && !isPullingDown.current) {
        return;
      }

      const effective = effectivePullRef.current;
      const shouldRefresh = effective >= TRIGGER_THRESHOLD;

      if (shouldRefresh) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPullProgress(TRIGGER_THRESHOLD * 0.6);
        triggerHaptic('light');

        try {
          await onRefresh();
        } finally {
          isRefreshingRef.current = false;
          setIsSnappingBack(true);
          setPullProgress(0);
          setIsRefreshing(false);
          setTimeout(() => setIsSnappingBack(false), 300);
        }
      } else {
        setIsSnappingBack(true);
        setPullProgress(0);
        setTimeout(() => setIsSnappingBack(false), 250);
      }

      resetTouchState();
    };

    const handleTouchCancel = () => {
      resetTouchState();
      setPullProgress(0);
    };

    scrollEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollEl.addEventListener('touchmove', handleTouchMove, { passive: true });
    scrollEl.addEventListener('touchend', handleTouchEnd);
    scrollEl.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      // Release singleton slot if we own it
      if (_ptrOwner === id) _ptrOwner = null;

      scrollEl.removeEventListener('scroll', onScroll);
      scrollEl.removeEventListener('touchstart', handleTouchStart);
      scrollEl.removeEventListener('touchmove', handleTouchMove);
      scrollEl.removeEventListener('touchend', handleTouchEnd);
      scrollEl.removeEventListener('touchcancel', handleTouchCancel);
      scrollEl.style.overscrollBehaviorY = '';
    };
  }, [onRefresh, applyRubberBand, enabled]);

  return {
    isRefreshing,
    pullProgress,
    isSnappingBack,
    scrollContainerRef,
    triggerThreshold: TRIGGER_THRESHOLD,
  };
}

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

export function useSwipeToAction(
  onSwipeAction: () => void,
  options: { threshold?: number; direction?: 'left' | 'right' } = {}
) {
  const { threshold = 100, direction = 'left' } = options;
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const currentDistance = useRef(0);
  const isSwipingRef = useRef(false);
  const actionTriggered = useRef(false);
  const directionLocked = useRef<'horizontal' | 'vertical' | null>(null);
  
  const lockThreshold = 20;
  const velocityThreshold = 0.5;
  const minSwipeDistance = 30;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
    currentDistance.current = 0;
    isSwipingRef.current = true;
    actionTriggered.current = false;
    directionLocked.current = null;
    setIsSwiping(false);
    setSwipeDistance(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwipingRef.current) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = direction === 'left' 
      ? startX.current - currentX 
      : currentX - startX.current;
    const deltaY = Math.abs(currentY - startY.current);
    
    if (!directionLocked.current) {
      if (Math.abs(deltaX) > lockThreshold || deltaY > lockThreshold) {
        if (Math.abs(deltaX) > deltaY * 1.5 && Math.abs(deltaX) > lockThreshold) {
          directionLocked.current = 'horizontal';
        } else if (deltaY > Math.abs(deltaX)) {
          directionLocked.current = 'vertical';
        }
      }
    }
    
    if (directionLocked.current === 'horizontal' && deltaX > minSwipeDistance) {
      e.preventDefault();
      e.stopPropagation();
      
      const clampedDistance = Math.min(deltaX, threshold * 1.3);
      currentDistance.current = clampedDistance;
      setSwipeDistance(clampedDistance);
      setIsSwiping(true);
      
      if (clampedDistance >= threshold * 0.5 && clampedDistance < threshold * 0.6) {
        triggerHaptic('light');
      }
      if (clampedDistance >= threshold && clampedDistance < threshold * 1.1) {
        triggerHaptic('medium');
      }
    }
  }, [direction, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwipingRef.current) return;
    
    const finalDistance = currentDistance.current;
    const wasHorizontalSwipe = directionLocked.current === 'horizontal';
    const timeDelta = Date.now() - startTime.current;
    const velocity = finalDistance / timeDelta;
    
    const passedThreshold = finalDistance >= threshold;
    const wasQuickFlick = velocity >= velocityThreshold && finalDistance >= threshold * 0.85;
    
    if (wasHorizontalSwipe && (passedThreshold || wasQuickFlick) && !actionTriggered.current) {
      actionTriggered.current = true;
      triggerHaptic('heavy');
      
      setTimeout(() => {
        onSwipeAction();
        setSwipeDistance(0);
        setIsSwiping(false);
        isSwipingRef.current = false;
        currentDistance.current = 0;
        directionLocked.current = null;
      }, 100);
    } else {
      setSwipeDistance(0);
      setTimeout(() => {
        setIsSwiping(false);
        isSwipingRef.current = false;
        currentDistance.current = 0;
        directionLocked.current = null;
      }, 200);
    }
  }, [threshold, onSwipeAction]);

  const resetSwipe = useCallback(() => {
    setSwipeDistance(0);
    setIsSwiping(false);
    isSwipingRef.current = false;
    currentDistance.current = 0;
    actionTriggered.current = false;
    directionLocked.current = null;
  }, []);

  return {
    swipeDistance,
    isSwiping,
    swipeProgress: Math.min((swipeDistance / threshold) * 100, 100),
    isHorizontalSwipe: directionLocked.current === 'horizontal',
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    resetSwipe,
  };
}
