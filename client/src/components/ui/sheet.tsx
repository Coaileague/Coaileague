"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X, Home } from "lucide-react"
import { useLocation } from "wouter"

import { cn } from "@/lib/utils"
import { HOME_BUTTON_CONFIG, MODAL_BUTTON_STYLES, getHomeButtonConfig } from "@/config/homeButton"
import { VisuallyHidden } from "@/components/ui/visually-hidden"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-[2000] bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-[2001] gap-3 bg-background p-3 md:p-4 shadow-sm transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch] box-border",
  {
    variants: {
      side: {
        top: "inset-x-0 top-[3.5rem] border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top max-h-[calc(100dvh-3.5rem)]",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom rounded-t-xl max-h-[100dvh] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-w-xl md:max-w-2xl lg:max-w-3xl sm:mx-auto",
        left: "left-0 top-[3.5rem] bottom-0 w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "right-0 top-[3.5rem] bottom-0 w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  showHomeButton?: boolean;
  homeButtonPath?: string;
  isGuest?: boolean;
  hideBuiltInClose?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, showHomeButton = HOME_BUTTON_CONFIG.enabled, homeButtonPath, isGuest = false, hideBuiltInClose = false, ...props }, ref) => {
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
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        aria-describedby={undefined}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        <VisuallyHidden>
          <SheetPrimitive.Title>Panel</SheetPrimitive.Title>
          <SheetPrimitive.Description>Panel content</SheetPrimitive.Description>
        </VisuallyHidden>
        {children}
        {!hideBuiltInClose && (
          <div className={cn("absolute right-3 top-3 sm:right-4 sm:top-4 flex items-center z-10", MODAL_BUTTON_STYLES.buttonGap)}>
            {showHomeButton && (
              <SheetPrimitive.Close
                onClick={handleHomeClick}
                className={MODAL_BUTTON_STYLES.homeButton.className}
                data-testid={config.testId}
                title={config.tooltip}
                aria-label={config.ariaLabel}
              >
                <Home className={MODAL_BUTTON_STYLES.homeButton.iconSize} />
                <span className="sr-only">{config.ariaLabel}</span>
              </SheetPrimitive.Close>
            )}
            <SheetPrimitive.Close className={MODAL_BUTTON_STYLES.closeButton.className}>
              <X className={MODAL_BUTTON_STYLES.closeButton.iconSize} />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          </div>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-0.5 text-center sm:text-left px-3 py-2 sm:px-5 sm:py-4 pr-24 sm:pr-28 shrink-0",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

/**
 * SheetStyledHeader - A header with integrated close button for colored/gradient headers
 * Use this when you need a styled header background with the close button visually inside it
 */
interface SheetStyledHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gradient';
  showClose?: boolean;
  onClose?: () => void;
}

const SheetStyledHeader = React.forwardRef<HTMLDivElement, SheetStyledHeaderProps>(
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
          "relative flex items-start justify-between gap-2 px-3 py-2.5 sm:px-5 sm:py-4",
          variantStyles[variant],
          className
        )}
        {...props}
      >
        <div className="flex flex-col space-y-1 min-w-0 flex-1 pr-2">
          {children}
        </div>
        {showClose && (
          <SheetPrimitive.Close 
            onClick={onClose}
            className="shrink-0 flex items-center justify-center rounded-md h-8 w-8 sm:h-9 sm:w-9 bg-white/20 text-inherit ring-offset-background transition-all hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 active:bg-white/40"
            data-testid="button-sheet-close"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </div>
    );
  }
);
SheetStyledHeader.displayName = "SheetStyledHeader"

/**
 * SheetBody - Proper content area with padding for sheet content
 */
const SheetBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex-1 overflow-y-auto min-h-0 px-3 py-3 sm:px-5 sm:py-4",
      className
    )}
    {...props}
  />
)
SheetBody.displayName = "SheetBody"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row flex-wrap justify-end gap-2 px-3 py-3 sm:px-5 sm:py-4 border-t border-border bg-muted/30 shrink-0",
      "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-base sm:text-lg font-semibold leading-tight", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-xs sm:text-sm text-muted-foreground leading-snug", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetStyledHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
