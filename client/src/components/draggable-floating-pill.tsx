/**
 * DraggableFloatingPill - Reusable floating overlay component
 * 
 * Features:
 * - Draggable with touch/mouse support
 * - Compact pill design with icon and count badge
 * - Drag handle indicator for accessibility
 * - Keyboard navigation (arrow keys, ESC)
 * - ARIA announcements for screen readers
 * - Reset position button
 * - Click-to-toggle functionality (separate from dragging)
 */

import { useState, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useDraggableOverlay } from '@/hooks/useDraggableOverlay';
import { GripVertical, RotateCcw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DraggableFloatingPillProps {
  /**
   * Unique storage key for position persistence
   */
  storageKey: string;
  
  /**
   * Icon to display in the pill
   */
  icon: LucideIcon;
  
  /**
   * Label text
   */
  label: string;
  
  /**
   * Count/badge number (optional)
   */
  count?: number;
  
  /**
   * Color classes for the pill background
   * Default: "bg-gradient-to-r from-orange-500 to-amber-500"
   */
  colorClass?: string;
  
  /**
   * Callback when pill is clicked (not dragged)
   */
  onClick?: () => void;
  
  /**
   * Additional CSS classes
   */
  className?: string;
  
  /**
   * Test ID for e2e testing
   */
  testId?: string;
}

export function DraggableFloatingPill({
  storageKey,
  icon: Icon,
  label,
  count,
  colorClass = "bg-gradient-to-r from-orange-500 to-amber-500",
  onClick,
  className,
  testId,
}: DraggableFloatingPillProps) {
  const [showResetButton, setShowResetButton] = useState(false);
  const clickStartPosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  
  const [state, handlers] = useDraggableOverlay({
    storageKey,
    width: 180,
    height: 60,
    safeArea: {
      top: 80, // Account for mobile header
      right: 16,
      bottom: 100, // Account for bottom nav/safe area
      left: 16,
    },
  });
  
  const { position, isDragging, ariaAnnouncement } = state;
  const { handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown, resetPosition } = handlers;
  
  // Track drag vs click
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    clickStartPosRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
    handlePointerDown(e);
  };
  
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (isDragging) {
      const dx = Math.abs(e.clientX - clickStartPosRef.current.x);
      const dy = Math.abs(e.clientY - clickStartPosRef.current.y);
      
      // If moved more than 5px, it's a drag not a click
      if (dx > 5 || dy > 5) {
        hasDraggedRef.current = true;
      }
    }
    handlePointerMove(e);
  };
  
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    handlePointerUp(e);
    
    // Only trigger onClick if we didn't drag
    if (!hasDraggedRef.current && onClick) {
      onClick();
    }
  };
  
  // Keyboard activation handler - Enter/Space to open, arrow keys to move
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Enter or Space key activates the pill (opens drawer)
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick();
      return;
    }
    
    // Delegate all other keys (arrows, ESC) to the draggable handler
    handleKeyDown(e);
  };
  
  return (
    <>
      {/* ARIA live region for announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {ariaAnnouncement}
      </div>
      
      <div
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          touchAction: 'none', // Prevent scroll while dragging
        }}
        className={cn(
          "z-50 select-none",
          className
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setShowResetButton(true)}
        onMouseLeave={() => setShowResetButton(false)}
        role="button"
        tabIndex={0}
        aria-label={`${label}${count !== undefined ? `: ${count} items` : ''}. Draggable. Press Enter to open, arrow keys to move, Escape to reset position.`}
        data-testid={testId || `floating-pill-${storageKey}`}
      >
        <div
          className={cn(
            "relative rounded-full shadow-lg transition-shadow",
            colorClass,
            isDragging ? "shadow-2xl cursor-grabbing" : "shadow-lg cursor-grab hover:shadow-xl"
          )}
        >
          {/* Main Pill Content */}
          <div className="flex items-center gap-2 px-4 py-3 text-white">
            {/* Drag Handle Indicator */}
            <button
              data-drag-handle
              className="flex-shrink-0 p-1 hover:bg-white/20 rounded cursor-grab active:cursor-grabbing touch-manipulation"
              aria-label="Drag handle - Hold and drag to move"
              onClick={(e) => e.stopPropagation()}
              tabIndex={-1}
            >
              <GripVertical className="w-4 h-4" />
            </button>
            
            {/* Icon */}
            <Icon className="w-5 h-5 flex-shrink-0" />
            
            {/* Label */}
            <span className="font-bold text-sm whitespace-nowrap">
              {label}
            </span>
            
            {/* Count Badge */}
            {count !== undefined && (
              <span 
                className="bg-white text-orange-600 font-bold text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                aria-label={`${count} ${count === 1 ? 'item' : 'items'}`}
              >
                {count}
              </span>
            )}
          </div>
          
          {/* Reset Position Button (shows on hover/focus) */}
          {showResetButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                resetPosition();
              }}
              className="absolute -top-2 -right-2 bg-white text-gray-700 rounded-full p-1.5 shadow-md hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
              aria-label="Reset position to default"
              data-testid={`button-reset-${storageKey}`}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
        
        {/* Keyboard Instructions (visually hidden but available to screen readers) */}
        <div className="sr-only">
          Use arrow keys to move, Shift+Arrow for larger movements, Escape to reset position.
        </div>
      </div>
    </>
  );
}
