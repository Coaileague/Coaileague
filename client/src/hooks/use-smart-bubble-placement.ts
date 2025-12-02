/**
 * useSmartBubblePlacement - Intelligent thought bubble positioning
 * 
 * Determines optimal bubble placement around the mascot to avoid blocking
 * interactive content like buttons, links, and navigation elements.
 * Falls back to semi-transparent mode when no safe position is available.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { uiAvoidanceSystem } from '@/lib/mascot/UIAvoidanceSystem';

type PlacementDirection = 'top' | 'right' | 'bottom' | 'left';

interface BubblePlacement {
  direction: PlacementDirection;
  isColliding: boolean;
  opacity: number;
  shouldAutoDismiss: boolean;
  position: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
    transform: string;
  };
}

interface PlacementConfig {
  bubbleWidth: number;
  bubbleHeight: number;
  mascotSize: number;
  mascotRight: number;
  mascotBottom: number;
  padding: number;
}

const DIRECTION_ORDER: PlacementDirection[] = ['top', 'left', 'right', 'bottom'];

const BUBBLE_DIMENSIONS = {
  width: 200,
  height: 50,
  padding: 8,
};

function getPositionStyles(direction: PlacementDirection): BubblePlacement['position'] {
  switch (direction) {
    case 'top':
      return {
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%) translateY(-8px)',
      };
    case 'bottom':
      return {
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%) translateY(8px)',
      };
    case 'left':
      return {
        top: '50%',
        right: '100%',
        transform: 'translateY(-50%) translateX(-8px)',
      };
    case 'right':
      return {
        top: '50%',
        left: '100%',
        transform: 'translateY(-50%) translateX(8px)',
      };
  }
}

function getBubbleRect(
  direction: PlacementDirection,
  mascotRect: DOMRect,
  bubbleWidth: number,
  bubbleHeight: number
): DOMRect {
  let x = 0, y = 0;
  
  switch (direction) {
    case 'top':
      x = mascotRect.left + mascotRect.width / 2 - bubbleWidth / 2;
      y = mascotRect.top - bubbleHeight - 16;
      break;
    case 'bottom':
      x = mascotRect.left + mascotRect.width / 2 - bubbleWidth / 2;
      y = mascotRect.bottom + 16;
      break;
    case 'left':
      x = mascotRect.left - bubbleWidth - 16;
      y = mascotRect.top + mascotRect.height / 2 - bubbleHeight / 2;
      break;
    case 'right':
      x = mascotRect.right + 16;
      y = mascotRect.top + mascotRect.height / 2 - bubbleHeight / 2;
      break;
  }
  
  return new DOMRect(x, y, bubbleWidth, bubbleHeight);
}

function isWithinViewport(rect: DOMRect, padding: number = 10): boolean {
  return (
    rect.left >= padding &&
    rect.top >= padding &&
    rect.right <= window.innerWidth - padding &&
    rect.bottom <= window.innerHeight - padding
  );
}

function isElementTrulyVisible(el: Element): boolean {
  const htmlEl = el as HTMLElement;
  const style = window.getComputedStyle(htmlEl);
  const rect = htmlEl.getBoundingClientRect();
  
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) < 0.1) return false;
  if (htmlEl.hidden) return false;
  if (htmlEl.getAttribute('aria-hidden') === 'true') return false;
  
  if (rect.right < 0 || rect.bottom < 0) return false;
  if (rect.left > window.innerWidth || rect.top > window.innerHeight) return false;
  
  const transform = style.transform;
  if (transform && transform !== 'none') {
    const match = transform.match(/translate[XY]?\s*\(\s*(-?\d+)/);
    if (match && Math.abs(parseInt(match[1])) > 1000) return false;
  }
  
  if (style.clipPath && style.clipPath !== 'none') {
    if (style.clipPath.includes('inset(100%)') || style.clipPath.includes('polygon(0 0, 0 0')) {
      return false;
    }
  }
  
  if (style.position === 'absolute' && style.clip) {
    if (style.clip.includes('rect(0') || style.clip.includes('rect(1px')) {
      return false;
    }
  }
  
  return true;
}

function checkCollisionWithUI(
  bubbleRect: DOMRect, 
  mascotContainer: HTMLElement | null
): boolean {
  if (uiAvoidanceSystem.checkCollision(bubbleRect)) {
    return true;
  }
  
  const zones = uiAvoidanceSystem.getZones();
  if (zones && zones.length > 0) {
    return false;
  }
  
  const sidebar = document.querySelector('[data-sidebar="sidebar"]');
  const header = document.querySelector('header');
  
  const criticalAreas: Element[] = [];
  if (sidebar) criticalAreas.push(...Array.from(sidebar.querySelectorAll('button:not([aria-hidden="true"])')));
  if (header) criticalAreas.push(...Array.from(header.querySelectorAll('button:not([aria-hidden="true"])')));
  
  for (const el of criticalAreas) {
    if (mascotContainer?.contains(el)) continue;
    if ((el as HTMLElement).closest('[data-testid="mascot-container"]')) continue;
    if (!isElementTrulyVisible(el)) continue;
    
    const elRect = el.getBoundingClientRect();
    if (elRect.width < 16 || elRect.height < 16) continue;
    
    const overlaps = !(
      bubbleRect.right < elRect.left ||
      bubbleRect.left > elRect.right ||
      bubbleRect.bottom < elRect.top ||
      bubbleRect.top > elRect.bottom
    );
    
    if (overlaps) return true;
  }
  
  return false;
}

interface CustomDimensions {
  width?: number;
  height?: number;
}

export function useSmartBubblePlacement(
  mascotContainerRef: React.RefObject<HTMLDivElement | null>,
  isThoughtVisible: boolean,
  customDimensions?: CustomDimensions
): BubblePlacement {
  const [placement, setPlacement] = useState<BubblePlacement>({
    direction: 'top',
    isColliding: false,
    opacity: 1,
    shouldAutoDismiss: false,
    position: getPositionStyles('top'),
  });
  
  const lastCheckRef = useRef<number>(0);
  const collisionCountRef = useRef<number>(0);
  
  const calculatePlacement = useCallback(() => {
    if (!mascotContainerRef.current || !isThoughtVisible) return;
    
    const now = Date.now();
    if (now - lastCheckRef.current < 100) return;
    lastCheckRef.current = now;
    
    const mascotContainer = mascotContainerRef.current;
    const mascotRect = mascotContainer.getBoundingClientRect();
    const bubbleWidth = customDimensions?.width ?? BUBBLE_DIMENSIONS.width;
    const bubbleHeight = customDimensions?.height ?? BUBBLE_DIMENSIONS.height;
    const padding = BUBBLE_DIMENSIONS.padding;
    
    for (const direction of DIRECTION_ORDER) {
      const bubbleRect = getBubbleRect(direction, mascotRect, bubbleWidth, bubbleHeight);
      
      if (!isWithinViewport(bubbleRect, padding)) continue;
      
      const isColliding = checkCollisionWithUI(bubbleRect, mascotContainer);
      
      if (!isColliding) {
        collisionCountRef.current = 0;
        setPlacement({
          direction,
          isColliding: false,
          opacity: 1,
          shouldAutoDismiss: false,
          position: getPositionStyles(direction),
        });
        return;
      }
    }
    
    collisionCountRef.current++;
    
    setPlacement({
      direction: 'top',
      isColliding: true,
      opacity: 0.75,
      shouldAutoDismiss: collisionCountRef.current > 2,
      position: getPositionStyles('top'),
    });
  }, [mascotContainerRef, isThoughtVisible, customDimensions?.width, customDimensions?.height]);
  
  useEffect(() => {
    if (!isThoughtVisible) {
      collisionCountRef.current = 0;
      return;
    }
    
    calculatePlacement();
    
    const handleScroll = () => calculatePlacement();
    const handleResize = () => calculatePlacement();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    
    const interval = setInterval(calculatePlacement, 500);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      clearInterval(interval);
    };
  }, [isThoughtVisible, calculatePlacement]);
  
  return placement;
}

export function getArrowStyles(direction: PlacementDirection): {
  position: string;
  transform: string;
  borderClasses: string;
} {
  switch (direction) {
    case 'top':
      return {
        position: 'absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
        transform: 'rotate(45deg)',
        borderClasses: 'border-r border-b',
      };
    case 'bottom':
      return {
        position: 'absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
        transform: 'rotate(45deg)',
        borderClasses: 'border-l border-t',
      };
    case 'left':
      return {
        position: 'absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
        transform: 'rotate(45deg)',
        borderClasses: 'border-t border-r',
      };
    case 'right':
      return {
        position: 'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
        transform: 'rotate(45deg)',
        borderClasses: 'border-b border-l',
      };
  }
}

export default useSmartBubblePlacement;
