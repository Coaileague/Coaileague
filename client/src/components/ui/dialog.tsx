"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, Home } from "lucide-react"
import { useLocation } from "wouter"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { HOME_BUTTON_CONFIG, getHomeButtonConfig } from "@/config/homeButton"

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
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogContentVariants = cva(
  "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-3 border bg-background/95 backdrop-blur-md p-4 shadow-2xl duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-xl max-h-[min(90vh,800px)] overflow-y-auto",
  {
    variants: {
      size: {
        sm: "w-[min(92vw,22rem)] max-w-none",
        md: "w-[min(92vw,26rem)] max-w-none",
        default: "w-[min(92vw,28rem)] max-w-none",
        lg: "w-[min(92vw,32rem)] max-w-none",
        xl: "w-[min(92vw,42rem)] max-w-none",
        full: "w-[min(95vw,56rem)] max-w-none",
      },
    },
  }
)

interface DialogContentProps 
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  showHomeButton?: boolean;
  homeButtonPath?: string;
  isGuest?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showHomeButton = HOME_BUTTON_CONFIG.enabled, homeButtonPath, isGuest = false, size, ...props }, ref) => {
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

  React.useEffect(() => {
    if (!HOME_BUTTON_CONFIG.escapeKeyEnabled) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showHomeButton) {
        handleHomeClick();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showHomeButton, navPath]);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(dialogContentVariants({ size }), className)}
        {...props}
      >
        {children}
        <div className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 flex items-center gap-0.5">
          {showHomeButton && (
            <button
              onClick={handleHomeClick}
              className="flex items-center justify-center rounded-md min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-accent active:bg-accent/80"
              data-testid={config.testId}
              title={config.tooltip}
              aria-label={config.ariaLabel}
            >
              <Home className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sr-only">{config.ariaLabel}</span>
            </button>
          )}
          <DialogPrimitive.Close className="flex items-center justify-center rounded-md min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:bg-accent active:bg-accent/80">
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
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
      "flex flex-col space-y-1 text-center sm:text-left pr-24 sm:pr-20",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2",
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
      "text-base font-semibold leading-none tracking-tight",
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
    className={cn("text-xs text-muted-foreground", className)}
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
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogContentVariants,
}
