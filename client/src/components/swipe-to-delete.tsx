/**
 * Swipe-to-Delete Component
 * iOS-style swipe to reveal delete action
 * With visual feedback and haptic response
 */

import { useSwipeToAction } from "@/hooks/use-touch-swipe";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const {
    swipeDistance,
    swipeProgress,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useSwipeToAction(onDelete, { threshold, direction: 'left' });

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden" data-testid="swipe-container">
      {/* Delete Action Background */}
      <div 
        className={cn(
          "absolute right-0 top-0 bottom-0 flex items-center justify-center px-6 transition-all",
          swipeProgress > 80 ? "bg-destructive" : "bg-destructive/70"
        )}
        style={{ width: `${swipeDistance}px` }}
      >
        <Trash2 
          className={cn(
            "h-5 w-5 text-destructive-foreground transition-transform",
            swipeProgress > 80 && "scale-125"
          )} 
        />
      </div>

      {/* Swipeable Content */}
      <div
        className="relative bg-card transition-transform touch-pan-y"
        style={{ 
          transform: `translateX(-${swipeDistance}px)`,
          transition: swipeDistance === 0 ? 'transform 0.3s ease-out' : 'none'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
