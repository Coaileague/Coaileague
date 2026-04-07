/**
 * useNavigationOverlay - Progressive Disclosure Navigation State Management
 * 
 * Manages the navigation overlay state for the slim header system:
 * - 150ms hover delay to prevent accidental triggers
 * - Click-to-toggle on mobile
 * - Escape key to close
 * - Animation state tracking
 * - Trinity drawer interaction (close one when other opens)
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export type TriggerSource = 'hover' | 'click' | 'keyboard';
export type AnimationState = 'entering' | 'entered' | 'exiting' | 'exited';

interface NavigationOverlayState {
  isOpen: boolean;
  isAnimating: boolean;
  activeCategory: string | null;
  hoveredSubItem: string | null;
  triggerSource: TriggerSource | null;
  animationState: AnimationState;
}

interface UseNavigationOverlayOptions {
  hoverDelay?: number;
  closeDelay?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useNavigationOverlay(options: UseNavigationOverlayOptions = {}) {
  const {
    hoverDelay = 80,
    closeDelay = 200,
    onOpen,
    onClose,
  } = options;

  const [state, setState] = useState<NavigationOverlayState>({
    isOpen: false,
    isAnimating: false,
    activeCategory: null,
    hoveredSubItem: null,
    triggerSource: null,
    animationState: 'exited',
  });

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const clearTimeouts = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const canToggle = useCallback((action: 'open' | 'close'): boolean => {
    if (state.isAnimating) return false;
    if (action === 'open' && state.isOpen) return false;
    if (action === 'close' && !state.isOpen) return false;
    return true;
  }, [state.isAnimating, state.isOpen]);

  const openOverlay = useCallback((source: TriggerSource) => {
    if (!canToggle('open')) return;

    clearTimeouts();
    setState(prev => ({
      ...prev,
      isOpen: true,
      isAnimating: true,
      triggerSource: source,
      animationState: 'entering',
    }));
    onOpen?.();

    setTimeout(() => {
      setState(prev => ({
        ...prev,
        isAnimating: false,
        animationState: 'entered',
      }));
    }, 160);
  }, [canToggle, clearTimeouts, onOpen]);

  const closeOverlay = useCallback(() => {
    if (!canToggle('close')) return;

    clearTimeouts();
    setState(prev => ({
      ...prev,
      isAnimating: true,
      animationState: 'exiting',
    }));

    setTimeout(() => {
      setState(prev => ({
        ...prev,
        isOpen: false,
        isAnimating: false,
        activeCategory: null,
        hoveredSubItem: null,
        triggerSource: null,
        animationState: 'exited',
      }));
      onClose?.();
      triggerRef.current?.focus();
    }, 120);
  }, [canToggle, clearTimeouts, onClose]);

  const toggleOverlay = useCallback((source: TriggerSource = 'click') => {
    if (state.isOpen) {
      closeOverlay();
    } else {
      openOverlay(source);
    }
  }, [state.isOpen, openOverlay, closeOverlay]);

  const handleMouseEnter = useCallback(() => {
    clearTimeouts();
    hoverTimeoutRef.current = setTimeout(() => {
      openOverlay('hover');
    }, hoverDelay);
  }, [clearTimeouts, hoverDelay, openOverlay]);

  const handleMouseLeave = useCallback(() => {
    clearTimeouts();
    if (state.isOpen && state.triggerSource === 'hover') {
      closeTimeoutRef.current = setTimeout(() => {
        closeOverlay();
      }, closeDelay);
    }
  }, [clearTimeouts, state.isOpen, state.triggerSource, closeDelay, closeOverlay]);

  const handleOverlayMouseEnter = useCallback(() => {
    clearTimeouts();
  }, [clearTimeouts]);

  const handleOverlayMouseLeave = useCallback(() => {
    if (state.triggerSource === 'hover') {
      closeTimeoutRef.current = setTimeout(() => {
        closeOverlay();
      }, closeDelay);
    }
  }, [state.triggerSource, closeDelay, closeOverlay, clearTimeouts]);

  const setActiveCategory = useCallback((categoryId: string | null) => {
    setState(prev => ({
      ...prev,
      activeCategory: categoryId,
    }));
  }, []);

  const setHoveredSubItem = useCallback((itemId: string | null) => {
    setState(prev => ({
      ...prev,
      hoveredSubItem: itemId,
    }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isOpen) {
        e.preventDefault();
        closeOverlay();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isOpen, closeOverlay]);

  useEffect(() => {
    if (state.isOpen) {
      document.body.setAttribute('data-nav-overlay-open', 'true');
    } else {
      document.body.removeAttribute('data-nav-overlay-open');
    }

    return () => {
      document.body.removeAttribute('data-nav-overlay-open');
    };
  }, [state.isOpen]);

  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  return {
    isOpen: state.isOpen,
    isAnimating: state.isAnimating,
    activeCategory: state.activeCategory,
    hoveredSubItem: state.hoveredSubItem,
    animationState: state.animationState,
    triggerSource: state.triggerSource,
    triggerRef,
    openOverlay,
    closeOverlay,
    toggleOverlay,
    handleMouseEnter,
    handleMouseLeave,
    handleOverlayMouseEnter,
    handleOverlayMouseLeave,
    setActiveCategory,
    setHoveredSubItem,
  };
}
