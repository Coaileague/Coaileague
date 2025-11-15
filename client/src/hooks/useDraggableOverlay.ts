/**
 * useDraggableOverlay - Reusable hook for creating draggable floating overlays
 * 
 * Features:
 * - Drag support via Pointer Events API (desktop + mobile touch)
 * - Position persistence via localStorage
 * - Viewport bounds clamping with safe-area awareness
 * - Keyboard navigation (arrow keys for nudging, ESC to reset)
 * - Accessibility (ARIA announcements, focusable handles)
 * 
 * Based on FloatingSupportChat implementation with enhanced accessibility
 */

import { useState, useRef, useEffect, useCallback, type PointerEvent, type KeyboardEvent } from 'react';

export interface DraggablePosition {
  x: number;
  y: number;
}

export interface DraggableOverlayOptions {
  /**
   * Unique ID for localStorage persistence (e.g., "approvals-pill", "reports-pill")
   */
  storageKey: string;
  
  /**
   * Initial position if no saved position exists
   * Defaults to bottom-right corner with safe margins
   */
  initialPosition?: DraggablePosition;
  
  /**
   * Width of the overlay (used for bounds clamping)
   * Default: 200
   */
  width?: number;
  
  /**
   * Height of the overlay (used for bounds clamping)
   * Default: 60
   */
  height?: number;
  
  /**
   * Safe area margins (prevents overlay from going off-screen)
   * Default: { top: 20, right: 20, bottom: 80, left: 20 }
   */
  safeArea?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  
  /**
   * Whether to announce drag state changes via ARIA live region
   * Default: true
   */
  announceChanges?: boolean;
  
  /**
   * Callback when position changes
   */
  onPositionChange?: (position: DraggablePosition) => void;
}

export interface DraggableOverlayState {
  position: DraggablePosition;
  isDragging: boolean;
  ariaAnnouncement: string;
}

export interface DraggableOverlayHandlers {
  handlePointerDown: (e: PointerEvent<HTMLElement>) => void;
  handlePointerMove: (e: PointerEvent<HTMLElement>) => void;
  handlePointerUp: (e: PointerEvent<HTMLElement>) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  resetPosition: () => void;
}

export function useDraggableOverlay(
  options: DraggableOverlayOptions
): [DraggableOverlayState, DraggableOverlayHandlers] {
  const {
    storageKey,
    initialPosition,
    width = 200,
    height = 60,
    safeArea = {},
    announceChanges = true,
    onPositionChange,
  } = options;
  
  const safeMargins = {
    top: safeArea.top ?? 20,
    right: safeArea.right ?? 20,
    bottom: safeArea.bottom ?? 80,
    left: safeArea.left ?? 20,
  };
  
  // Calculate default initial position (bottom-right with safe margins)
  const getDefaultPosition = (): DraggablePosition => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    
    return initialPosition || {
      x: Math.max(0, window.innerWidth - width - safeMargins.right),
      y: Math.max(0, window.innerHeight - height - safeMargins.bottom),
    };
  };
  
  const [position, setPosition] = useState<DraggablePosition>(getDefaultPosition());
  const [isDragging, setIsDragging] = useState(false);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  
  // Clamp position within viewport bounds
  const clampPosition = useCallback((pos: DraggablePosition): DraggablePosition => {
    if (typeof window === 'undefined') return pos;
    
    const maxX = window.innerWidth - width - safeMargins.right;
    const maxY = window.innerHeight - height - safeMargins.bottom;
    
    return {
      x: Math.max(safeMargins.left, Math.min(pos.x, maxX)),
      y: Math.max(safeMargins.top, Math.min(pos.y, maxY)),
    };
  }, [width, height, safeMargins]);
  
  // Load saved position from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const saved = localStorage.getItem(`draggable-overlay-${storageKey}`);
    if (saved) {
      try {
        const savedPosition = JSON.parse(saved) as DraggablePosition;
        setPosition(clampPosition(savedPosition));
      } catch {
        // Fallback to default
        setPosition(getDefaultPosition());
      }
    } else {
      setPosition(getDefaultPosition());
    }
  }, [storageKey, clampPosition]);
  
  // Save position to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`draggable-overlay-${storageKey}`, JSON.stringify(position));
    onPositionChange?.(position);
  }, [position, storageKey, onPositionChange]);
  
  // Viewport resize handler - reclamp position
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setPosition(prev => clampPosition(prev));
    };
    
    window.addEventListener('resize', handleResize);
    
    // Also reclamp on orientation change
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [clampPosition]);
  
  // Pointer down handler - start drag
  const handlePointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    // Don't drag when interacting with buttons, inputs, etc.
    if ((e.target as HTMLElement).closest('button:not([data-drag-handle]), input, textarea, select, a')) {
      return;
    }
    
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    if (announceChanges) {
      setAriaAnnouncement('Dragging started');
    }
  }, [position, announceChanges]);
  
  // Pointer move handler - update position while dragging
  const handlePointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!isDraggingRef.current || typeof window === 'undefined') return;
    
    const newPosition = clampPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
    
    setPosition(newPosition);
  }, [clampPosition]);
  
  // Pointer up handler - end drag
  const handlePointerUp = useCallback((e: PointerEvent<HTMLElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      
      if (announceChanges) {
        setAriaAnnouncement('Dragging ended. Use arrow keys to adjust position or Escape to reset.');
      }
    }
  }, [announceChanges]);
  
  // Keyboard handler - arrow keys for nudging, ESC to reset
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    const nudgeAmount = e.shiftKey ? 20 : 5; // Shift for larger movements
    
    let newPosition = { ...position };
    let handled = false;
    
    switch (e.key) {
      case 'ArrowUp':
        newPosition.y -= nudgeAmount;
        handled = true;
        break;
      case 'ArrowDown':
        newPosition.y += nudgeAmount;
        handled = true;
        break;
      case 'ArrowLeft':
        newPosition.x -= nudgeAmount;
        handled = true;
        break;
      case 'ArrowRight':
        newPosition.x += nudgeAmount;
        handled = true;
        break;
      case 'Escape':
        resetPosition();
        handled = true;
        break;
    }
    
    if (handled) {
      e.preventDefault();
      if (e.key !== 'Escape') {
        setPosition(clampPosition(newPosition));
        if (announceChanges) {
          setAriaAnnouncement(`Moved ${e.key.replace('Arrow', '')} by ${nudgeAmount} pixels`);
        }
      }
    }
  }, [position, clampPosition, announceChanges]);
  
  // Reset position to default
  const resetPosition = useCallback(() => {
    const defaultPos = getDefaultPosition();
    setPosition(defaultPos);
    
    if (announceChanges) {
      setAriaAnnouncement('Position reset to default location');
    }
  }, [announceChanges, clampPosition]);
  
  const state: DraggableOverlayState = {
    position,
    isDragging,
    ariaAnnouncement,
  };
  
  const handlers: DraggableOverlayHandlers = {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    resetPosition,
  };
  
  return [state, handlers];
}
