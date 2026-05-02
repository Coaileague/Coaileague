import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { Home } from "lucide-react"
import { useLocation } from "wouter"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { HOME_BUTTON_CONFIG, getHomeButtonConfig } from "@/config/homeButton"
import { useIsMobile } from "@/hooks/use-mobile"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-[10000] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const desktopVariants = cva(
  "fixed left-[50%] top-[50%] z-[10001] grid translate-x-[-50%] translate-y-[-50%] gap-3 border bg-background p-5 shadow-sm duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-md max-h-[80dvh] sm:max-h-[90ddvh] overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch] box-border w-[calc(100vw-2rem)]",
  {
    variants: {
      size: {
        sm: "max-w-xs",
        md: "max-w-sm",
        default: "max-w-sm",
        lg: "max-w-md",
      },
    },
    defaultVariants: { size: "default" },
  }
)

const mobileClasses =
  "fixed bottom-0 left-0 right-0 z-[10001] w-full rounded-t-md border-t bg-background pt-2 pb-[env(safe-area-inset-bottom,16px)] px-4 shadow-sm duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slimax-h-[80dvh] sm:max-h-[92ddvh]ttom max-h-[92dvh] overflow-y-auto overscroll-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"

interface AlertDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>,
    VariantProps<typeof desktopVariants> {
  showHomeButton?: boolean;
  homeButtonPath?: string;
  isGuest?: boolean;
}

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(({ className, children, showHomeButton = HOME_BUTTON_CONFIG.enabled, homeButtonPath, isGuest = false, size, ...props }, ref) => {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
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
      if (e.key === 'Escape' && showHomeButton) handleHomeClick();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showHomeButton, navPath]);

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          isMobile ? mobileClasses : desktopVariants({ size }),
          className
        )}
        {...props}
      >
        {isMobile && (
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {showHomeButton && (
          <button
            onClick={handleHomeClick}
            className="absolute right-2 top-3 flex items-center justify-center rounded-md min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            data-testid={config.testId}
            title={config.tooltip}
            aria-label={config.ariaLabel}
          >
            <Home className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="sr-only">{config.ariaLabel}</span>
          </button>
        )}
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
})
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-left pr-24 sm:pr-28",
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-2",
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold", className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), className)}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
