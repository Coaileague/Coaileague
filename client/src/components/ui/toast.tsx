import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckCircle2, XCircle, AlertTriangle, Info, ArrowRight, X } from "lucide-react"
import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

// Vivaldi-style: bottom-right desktop, top mobile, max 340px wide
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed z-[6000] flex max-h-screen w-full flex-col gap-2 p-3",
      // Mobile: top of screen below header
      "top-[calc(3.5rem+env(safe-area-inset-top))] left-2 right-2",
      // Desktop: bottom-right corner
      "sm:top-auto sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-[340px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

// Accent colors per variant (left border + icon)
const variantMeta = {
  default:     { border: "hsl(var(--border))",          icon: null,                          text: "hsl(var(--muted-foreground))" },
  success:     { border: "hsl(142 71% 45%)",            icon: <CheckCircle2 className="h-4 w-4" />, text: "hsl(142 71% 38%)" },
  destructive: { border: "hsl(var(--destructive))",     icon: <XCircle className="h-4 w-4" />,     text: "hsl(var(--destructive))" },
  warning:     { border: "hsl(38 92% 50%)",             icon: <AlertTriangle className="h-4 w-4" />, text: "hsl(38 78% 40%)" },
  info:        { border: "hsl(217 91% 60%)",            icon: <Info className="h-4 w-4" />,         text: "hsl(217 91% 50%)" },
} as const

const toastVariants = cva(
  // Base: clean minimal pill with left accent border
  [
    "group pointer-events-auto relative flex w-full items-start gap-2.5",
    "rounded-lg border bg-background/98 backdrop-blur-sm px-3 py-2.5 shadow-sm",
    "border-l-[3px] pr-8",
    // Swipe + animation
    "data-[swipe=cancel]:translate-x-0",
    "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-80",
    "data-[state=open]:slide-in-from-top-2 sm:data-[state=open]:slide-in-from-bottom-2",
    "data-[state=closed]:slide-out-to-right-full",
    "transition-all duration-200",
  ],
  {
    variants: {
      variant: {
        default:     "border-l-[hsl(var(--border))] text-foreground",
        success:     "border-l-[hsl(142_71%_45%)] text-foreground",
        destructive: "border-l-[hsl(var(--destructive))] text-foreground",
        warning:     "border-l-[hsl(38_92%_50%)] text-foreground",
        info:        "border-l-[hsl(217_91%_60%)] text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant = "default", ...props }, ref) => {
  const meta = variantMeta[variant ?? "default"]
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 text-xs font-medium text-primary",
      "hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "shrink-0 transition-colors",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

// Always-visible dismiss button (not hover-only)
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-1.5 top-1.5 rounded p-0.5",
      "text-foreground/30 hover:text-foreground/60",
      "transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3 w-3" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-xs font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-[11px] text-muted-foreground leading-snug", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

// Icon getter used by the Toaster
export function getToastIcon(variant?: string) {
  const cls = "h-4 w-4 shrink-0 mt-0.5"
  switch (variant) {
    case "success":     return <CheckCircle2 className={cn(cls, "text-green-500")} />
    case "destructive": return <XCircle      className={cn(cls, "text-destructive")} />
    case "warning":     return <AlertTriangle className={cn(cls, "text-amber-500")} />
    case "info":        return <Info          className={cn(cls, "text-blue-500")} />
    default:            return null
  }
}

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps, type ToastActionElement,
  ToastProvider, ToastViewport, Toast,
  ToastTitle, ToastDescription, ToastClose, ToastAction,
}
