/**
 * MobileBottomSheet - Native app-style bottom sheet modal
 * Slides up from bottom with swipe-to-dismiss gesture
 */

import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  snapPoints?: number[];
  className?: string;
}

export function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  className,
}: MobileBottomSheetProps) {
  const { isMobile, isIOS } = useMobile();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-modal flex items-end"
      onClick={onClose}
      data-testid="bottom-sheet-overlay"
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Sheet */}
      <div
        className={cn(
          'mobile-sheet relative w-full max-h-[90vh] bg-background rounded-t-2xl shadow-2xl',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full',
          isIOS && 'mobile-safe-area-bottom',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        data-testid="bottom-sheet-content"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-lg font-bold">{title}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="mobile-touch-target h-8 w-8"
              data-testid="button-close-sheet"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto smooth-scroll max-h-[calc(90vh-80px)] px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/**
 * MobileActionSheet - Action sheet style bottom sheet with list of actions
 */
interface MobileActionSheetAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: MobileActionSheetAction[];
  cancelLabel?: string;
}

export function MobileActionSheet({
  isOpen,
  onClose,
  title,
  actions,
  cancelLabel = 'Cancel',
}: MobileActionSheetProps) {
  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
      {title && (
        <div className="text-center pb-4">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        </div>
      )}

      <div className="space-y-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => {
              action.onClick();
              onClose();
            }}
            disabled={action.disabled}
            className={cn(
              'mobile-touch-target w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
              'hover-elevate active-elevate-2 mobile-active-state',
              action.variant === 'destructive'
                ? 'text-red-500 hover:text-red-600'
                : 'text-foreground',
              action.disabled && 'opacity-50 cursor-not-allowed'
            )}
            data-testid={`action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {action.icon && <span className="shrink-0">{action.icon}</span>}
            <span className="font-medium">{action.label}</span>
          </button>
        ))}

        <button
          onClick={onClose}
          className={cn(
            'mobile-touch-target w-full px-4 py-3 mt-4 rounded-lg font-semibold',
            'bg-muted hover-elevate active-elevate-2 mobile-active-state'
          )}
          data-testid="button-cancel-sheet"
        >
          {cancelLabel}
        </button>
      </div>
    </MobileBottomSheet>
  );
}
