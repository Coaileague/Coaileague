"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Home } from "lucide-react"
import { useLocation } from "wouter"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { HOME_BUTTON_CONFIG, MODAL_BUTTON_STYLES, getHomeButtonConfig } from "@/config/homeButton"
import { VisuallyHidden } from "@/components/ui/visually-hidden"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[2500] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=closed]:pointer-events-none",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogContentVariants = cva(
  "fixed left-[50%] top-[50%] z-[2501] grid max-w-none translate-x-[-50%] translate-y-[-50%] gap-2 border bg-background/95 backdrop-blur-md p-3 sm:p-4 shadow-sm duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 rounded-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch] box-border",
  {
    variants: {
      size: {
        sm: "w-[min(92vw,22rem)]",
        md: "w-[min(92vw,26rem)]",
        default: "w-[min(92vw,28rem)]",
        lg: "w-[min(92vw,32rem)]",
        xl: "w-[min(92vw,42rem)]",
        full: "w-[min(95vw,56rem)]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface DialogContentProps 
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  showHomeButton?: boolean;
  homeButtonPath?: string;
  isGuest?: boolean;
  hideBuiltInClose?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showHomeButton = HOME_BUTTON_CONFIG.enabled, homeButtonPath, isGuest = false, size, hideBuiltInClose = false, ...props }, ref) => {
  const [, setLocation] = useLocation();
  const config = getHomeButtonConfig(isGuest);
  const navPath = homeButtonPath || config.navigationPath;

  const handleHomeClick = () => {
    if (config.useFullPageReload) {
      window.location.href = navPath;
    } else {
      setLocation(navPath);
    }
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        aria-label="Dialog"
        aria-describedby={undefined}
        className={cn(dialogContentVariants({ size }), className)}
        {...props}
      >
        <VisuallyHidden>
          <DialogPrimitive.Title>Dialog</DialogPrimitive.Title>
          <DialogPrimitive.Description>Dialog content</DialogPrimitive.Description>
        </VisuallyHidden>
        {children}
        {!hideBuiltInClose && (
          <div className={cn("absolute right-3 top-3 sm:right-4 sm:top-4 flex items-center z-10", MODAL_BUTTON_STYLES.buttonGap)}>
            {showHomeButton && (
              <DialogPrimitive.Close
                onClick={handleHomeClick}
                className={cn(MODAL_BUTTON_STYLES.homeButton.className, MODAL_BUTTON_STYLES.desktop.minSize)}
                data-testid={config.testId}
                title={config.tooltip}
                aria-label={config.ariaLabel}
              >
                <Home className={MODAL_BUTTON_STYLES.homeButton.iconSize} />
                <span className="sr-only">{config.ariaLabel}</span>
              </DialogPrimitive.Close>
            )}
            <DialogPrimitive.Close className={cn(MODAL_BUTTON_STYLES.closeButton.className, MODAL_BUTTON_STYLES.desktop.minSize)}>
              <X className={MODAL_BUTTON_STYLES.closeButton.iconSize} />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-0.5 text-center sm:text-left px-3 py-2 sm:px-5 sm:py-4 pr-24 sm:pr-28 shrink-0 min-h-0",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/**
 * DialogStyledHeader - A header with integrated close button for colored/gradient headers
 * Use this when you need a styled header background with the close button visually inside it
 */
interface DialogStyledHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gradient';
  showClose?: boolean;
  onClose?: () => void;
}

const DialogStyledHeader = React.forwardRef<HTMLDivElement, DialogStyledHeaderProps>(
  ({ className, variant = 'primary', showClose = true, onClose, children, ...props }, ref) => {
    const variantStyles = {
      primary: 'bg-primary text-primary-foreground',
      success: 'bg-green-500 text-white',
      warning: 'bg-amber-500 text-white',
      danger: 'bg-red-500 text-white',
      info: 'bg-blue-500 text-white',
      gradient: 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground',
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex items-start justify-between gap-2 px-3 py-2.5 sm:px-5 sm:py-4 rounded-t-xl",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        <div className="flex flex-col space-y-1 min-w-0 flex-1 pr-2">
          {children}
        </div>
        {showClose && (
          <DialogPrimitive.Close 
            onClick={onClose}
            className="shrink-0 flex items-center justify-center rounded-md h-8 w-8 sm:h-9 sm:w-9 bg-white/20 text-inherit ring-offset-background transition-all hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 active:bg-white/40"
            data-testid="button-dialog-close"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </div>
    );
  }
);
DialogStyledHeader.displayName = "DialogStyledHeader"

/**
 * DialogBody - Proper content area with padding for dialog content
 */
const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5",
      className
    )}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row flex-wrap justify-end gap-2 px-3 py-3 sm:px-5 sm:py-4 border-t border-border bg-muted/30 rounded-b-xl shrink-0",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-base sm:text-lg font-semibold leading-tight tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-xs sm:text-sm text-muted-foreground leading-snug", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogStyledHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogContentVariants,
}
