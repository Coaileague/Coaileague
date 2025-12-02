/**
 * useMascotPosition - Manages draggable mascot positioning with localStorage persistence
 * 
 * Features:
 * - Draggable positioning around the screen
 * - localStorage persistence of position
 * - Bounds checking to keep mascot visible
 * - Reset to default position
 * - Size variant toggle (mini/expanded)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface Position {
  x: number;
  y: number;
}

interface MascotPositionState {
  position: Position;
  isExpanded: boolean;
  isDragging: boolean;
}

const STORAGE_KEY = 'coaileague-mascot-position';
const EXPANDED_STORAGE_KEY = 'coaileague-mascot-expanded';

const DEFAULT_POSITION: Position = {
  x: 24,
  y: 24,
};

export function useMascotPosition(bubbleSize: number = 80) {
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  useEffect(() => {
    try {
      const savedPosition = localStorage.getItem(STORAGE_KEY);
      const savedExpanded = localStorage.getItem(EXPANDED_STORAGE_KEY);
      
      if (savedPosition) {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      }
      if (savedExpanded) {
        setIsExpanded(savedExpanded === 'true');
      }
    } catch (e) {
      console.warn('Failed to load mascot position:', e);
    }
  }, []);

  const savePosition = useCallback((pos: Position) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch (e) {
      console.warn('Failed to save mascot position:', e);
    }
  }, []);

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStart.current = {
      x: clientX,
      y: clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragStart.current || !isDragging) return;

    const deltaX = clientX - dragStart.current.x;
    const deltaY = clientY - dragStart.current.y;

    // For right/bottom anchored positioning: subtract deltas (inverted)
    const newX = dragStart.current.posX - deltaX;
    const newY = dragStart.current.posY - deltaY;

    const maxX = window.innerWidth - bubbleSize - 16;
    const maxY = window.innerHeight - bubbleSize - 16;

    const clampedX = Math.max(16, Math.min(newX, maxX));
    const clampedY = Math.max(16, Math.min(newY, maxY));

    setPosition({ x: clampedX, y: clampedY });
  }, [isDragging, bubbleSize]);

  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      savePosition(position);
    }
    setIsDragging(false);
    dragStart.current = null;
  }, [isDragging, position, savePosition]);

  const resetPosition = useCallback(() => {
    setPosition(DEFAULT_POSITION);
    savePosition(DEFAULT_POSITION);
  }, [savePosition]);

  const toggleExpanded = useCallback(() => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, String(newExpanded));
    } catch (e) {
      console.warn('Failed to save mascot expanded state:', e);
    }
  }, [isExpanded]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleDragStart(e.clientX, e.clientY);
  }, [handleDragStart]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      handleDragMove(e.clientX, e.clientY);
    }
  }, [isDragging, handleDragMove]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    handleDragEnd();
  }, [handleDragEnd]);

  return {
    position,
    isExpanded,
    isDragging,
    toggleExpanded,
    resetPosition,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}
