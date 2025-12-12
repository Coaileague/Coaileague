/**
 * useMascotPosition - Manages mascot positioning with localStorage persistence
 * 
 * Features:
 * - DRAGGING PERMANENTLY DISABLED - Trinity is non-draggable
 * - localStorage persistence of position
 * - Bounds checking to keep mascot visible
 * - Reset to default position
 * - Size variant toggle (mini/expanded)
 * 
 * Uses universal mascot configuration from @/config/mascotConfig
 */

import { useState, useEffect, useCallback } from 'react';
import MASCOT_CONFIG from '@/config/mascotConfig';

interface Position {
  x: number;
  y: number;
}

const { storageKeys, defaultPosition, mobileDefaultPosition } = MASCOT_CONFIG;

export function useMascotPosition(bubbleSize: number = 80, isMobile: boolean = false) {
  const initialPosition = isMobile ? mobileDefaultPosition : defaultPosition;
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isExpanded, setIsExpanded] = useState(false);
  // Dragging is permanently disabled - isDragging always false
  const isDragging = false;

  useEffect(() => {
    try {
      const savedPosition = localStorage.getItem(storageKeys.position);
      const savedExpanded = localStorage.getItem(storageKeys.expanded);
      
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition);
        const minPos = 16;
        const maxX = window.innerWidth - bubbleSize - 16;
        // Header exclusion zone: Keep mascot away from top area with header controls
        const HEADER_HEIGHT = 64;
        const HEADER_MARGIN = 24;
        const maxY = window.innerHeight - HEADER_HEIGHT - bubbleSize - HEADER_MARGIN;
        
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number' &&
            parsed.x >= minPos && parsed.x <= maxX &&
            parsed.y >= minPos && parsed.y <= maxY) {
          setPosition(parsed);
        } else {
          localStorage.removeItem(storageKeys.position);
          setPosition(defaultPosition);
        }
      }
      if (savedExpanded) {
        setIsExpanded(savedExpanded === 'true');
      }
    } catch (e) {
      console.warn('Failed to load mascot position:', e);
      localStorage.removeItem(storageKeys.position);
    }
  }, [bubbleSize]);

  const savePosition = useCallback((pos: Position) => {
    try {
      localStorage.setItem(storageKeys.position, JSON.stringify(pos));
    } catch (e) {
      console.warn('Failed to save mascot position:', e);
    }
  }, []);

  const resetPosition = useCallback(() => {
    setPosition(defaultPosition);
    savePosition(defaultPosition);
  }, [savePosition]);

  const toggleExpanded = useCallback(() => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    try {
      localStorage.setItem(storageKeys.expanded, String(newExpanded));
    } catch (e) {
      console.warn('Failed to save mascot expanded state:', e);
    }
  }, [isExpanded]);

  // Drag handlers completely disabled - Trinity is non-draggable
  // These are no-ops that prevent any drag behavior
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Dragging completely disabled - do nothing
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // Dragging completely disabled - do nothing
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    // Dragging completely disabled - do nothing
  }, []);

  const setRoamingPosition = useCallback((pos: Position) => {
    setPosition(pos);
    savePosition(pos);
  }, [savePosition]);

  return {
    position,
    isExpanded,
    isDragging,
    toggleExpanded,
    resetPosition,
    setRoamingPosition,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}
