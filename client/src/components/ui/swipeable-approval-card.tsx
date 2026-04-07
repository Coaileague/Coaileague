/**
 * SwipeableApprovalCard - Mobile-optimized approval card with swipe gestures
 * Swipe right to approve, swipe left to deny
 * Features haptic feedback and visual indicators
 */

import { ReactNode, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSwipeToAction, triggerHaptic } from "@/hooks/use-touch-swipe";
import { useIsMobile } from "@/hooks/use-mobile";
import { CheckCircle2, XCircle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeableApprovalCardProps {
  id: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  onApprove: () => void;
  onDeny: () => void;
  isProcessing?: boolean;
  className?: string;
  approveLabel?: string;
  denyLabel?: string;
  showDesktopButtons?: boolean;
}

export function SwipeableApprovalCard({
  id,
  title,
  subtitle,
  badge,
  children,
  onApprove,
  onDeny,
  isProcessing = false,
  className,
  approveLabel = "Approve",
  denyLabel = "Deny",
  showDesktopButtons = true,
}: SwipeableApprovalCardProps) {
  const isMobile = useIsMobile();
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  const handleApproveSwipe = useCallback(() => {
    if (isProcessing) return;
    triggerHaptic('medium');
    setSwipeDirection('right');
    setTimeout(() => {
      onApprove();
      setSwipeDirection(null);
    }, 200);
  }, [onApprove, isProcessing]);

  const handleDenySwipe = useCallback(() => {
    if (isProcessing) return;
    triggerHaptic('medium');
    setSwipeDirection('left');
    setTimeout(() => {
      onDeny();
      setSwipeDirection(null);
    }, 200);
  }, [onDeny, isProcessing]);

  const approveSwipe = useSwipeToAction(handleApproveSwipe, { 
    threshold: 100, 
    direction: 'right' 
  });

  const denySwipe = useSwipeToAction(handleDenySwipe, { 
    threshold: 100, 
    direction: 'left' 
  });

  const [touchStartX, setTouchStartX] = useState(0);
  const [currentSwipeDistance, setCurrentSwipeDistance] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || isProcessing) return;
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || isProcessing) return;
    const currentX = e.touches[0].clientX;
    const distance = currentX - touchStartX;
    setCurrentSwipeDistance(distance);
  };

  const handleTouchEnd = () => {
    if (!isMobile || isProcessing) return;
    
    if (currentSwipeDistance > 80) {
      handleApproveSwipe();
    } else if (currentSwipeDistance < -80) {
      handleDenySwipe();
    }
    
    setCurrentSwipeDistance(0);
    setTouchStartX(0);
  };

  const swipeProgress = Math.min(Math.abs(currentSwipeDistance) / 100, 1);
  const isSwipingRight = currentSwipeDistance > 0;
  const isSwipingLeft = currentSwipeDistance < 0;

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg",
        swipeDirection === 'right' && 'animate-slide-right',
        swipeDirection === 'left' && 'animate-slide-left',
        className
      )}
      data-testid={`swipeable-card-${id}`}
    >
      {isMobile && (
        <>
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex items-center justify-center bg-green-500 text-white transition-all",
              isSwipingRight ? "opacity-100" : "opacity-0"
            )}
            style={{ 
              width: `${Math.max(currentSwipeDistance, 0)}px`,
              minWidth: isSwipingRight ? '60px' : '0'
            }}
          >
            <CheckCircle2 
              className="h-6 w-6" 
              style={{ opacity: swipeProgress }}
            />
          </div>

          <div
            className={cn(
              "absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-white transition-all",
              isSwipingLeft ? "opacity-100" : "opacity-0"
            )}
            style={{ 
              width: `${Math.max(-currentSwipeDistance, 0)}px`,
              minWidth: isSwipingLeft ? '60px' : '0'
            }}
          >
            <XCircle 
              className="h-6 w-6" 
              style={{ opacity: swipeProgress }}
            />
          </div>
        </>
      )}

      <Card
        className={cn(
          "relative transition-transform duration-100 ease-out border",
          isMobile && "touch-pan-y"
        )}
        style={{
          transform: isMobile ? `translateX(${currentSwipeDistance}px)` : undefined
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base md:text-lg line-clamp-2">
                {title}
              </CardTitle>
              {subtitle && (
                <CardDescription className="text-xs md:text-sm">
                  {subtitle}
                </CardDescription>
              )}
            </div>
            {badge}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {children}

          {isMobile && (
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-1">
                <ChevronLeft className="h-4 w-4 text-red-500" />
                <span>Swipe left to deny</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Swipe right to approve</span>
                <ChevronRight className="h-4 w-4 text-green-500" />
              </div>
            </div>
          )}

          {showDesktopButtons && !isMobile && (
            <div className="flex gap-2 pt-2 border-t">
              <Button
                onClick={onApprove}
                disabled={isProcessing}
                className="flex-1"
                data-testid={`button-approve-${id}`}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {approveLabel}
              </Button>
              <Button
                variant="destructive"
                onClick={onDeny}
                disabled={isProcessing}
                className="flex-1"
                data-testid={`button-deny-${id}`}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {denyLabel}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface SwipeableDismissCardProps {
  id: string;
  children: ReactNode;
  onDismiss: () => void;
  className?: string;
  dismissDirection?: 'left' | 'right' | 'both';
}

export function SwipeableDismissCard({
  id,
  children,
  onDismiss,
  className,
  dismissDirection = 'left',
}: SwipeableDismissCardProps) {
  const isMobile = useIsMobile();
  const [isDismissed, setIsDismissed] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [currentSwipeDistance, setCurrentSwipeDistance] = useState(0);

  const handleDismiss = useCallback(() => {
    triggerHaptic('light');
    setIsDismissed(true);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  if (isDismissed) {
    return null;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile) return;
    const currentX = e.touches[0].clientX;
    const distance = currentX - touchStartX;
    
    if (dismissDirection === 'left' && distance < 0) {
      setCurrentSwipeDistance(distance);
    } else if (dismissDirection === 'right' && distance > 0) {
      setCurrentSwipeDistance(distance);
    } else if (dismissDirection === 'both') {
      setCurrentSwipeDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile) return;
    
    const threshold = 100;
    if (Math.abs(currentSwipeDistance) > threshold) {
      handleDismiss();
    } else {
      setCurrentSwipeDistance(0);
    }
    setTouchStartX(0);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden transition-all duration-200",
        isDismissed && "opacity-0 h-0",
        className
      )}
      data-testid={`swipe-dismiss-${id}`}
    >
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-white w-16"
        style={{
          opacity: Math.min(Math.abs(currentSwipeDistance) / 100, 1),
          display: currentSwipeDistance < 0 ? 'flex' : 'none'
        }}
      >
        <XCircle className="h-5 w-5" />
      </div>

      <div
        className={cn(
          "relative bg-background transition-transform duration-100",
          isMobile && "touch-pan-y"
        )}
        style={{
          transform: `translateX(${currentSwipeDistance}px)`
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

interface MobileApprovalActionsProps {
  onApprove: () => void;
  onDeny: () => void;
  isProcessing?: boolean;
  approveLabel?: string;
  denyLabel?: string;
}

export function MobileApprovalActions({
  onApprove,
  onDeny,
  isProcessing = false,
  approveLabel = "Approve",
  denyLabel = "Deny",
}: MobileApprovalActionsProps) {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t z-50 safe-area-bottom">
      <div className="flex gap-3 max-w-lg mx-auto">
        <Button
          variant="destructive"
          onClick={onDeny}
          disabled={isProcessing}
          className="flex-1 h-12"
          data-testid="button-mobile-deny"
        >
          <XCircle className="mr-2 h-5 w-5" />
          {denyLabel}
        </Button>
        <Button
          onClick={onApprove}
          disabled={isProcessing}
          className="flex-1 h-12"
          data-testid="button-mobile-approve"
        >
          {isProcessing ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-5 w-5" />
          )}
          {approveLabel}
        </Button>
      </div>
    </div>
  );
}
