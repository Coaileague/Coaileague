import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  text?: string
}

export function LoadingSpinner({ size = "md", className, text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  }

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="relative">
        <div
          className={cn(
            "animate-spin rounded-full border-4 border-gray-300 dark:border-gray-700",
            sizeClasses[size]
          )}
          style={{
            borderTopColor: "#3b82f6", // Blue-500 for new branding
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
      {text && (
        <p className="text-sm font-medium text-muted-foreground">
          {text}
        </p>
      )}
    </div>
  )
}

export function LoadingOverlay({ text }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-card rounded-lg shadow-lg p-8 flex flex-col items-center gap-4 border border-border">
        <LoadingSpinner size="lg" />
        {text && (
          <p className="text-base font-medium text-foreground">
            {text}
          </p>
        )}
      </div>
    </div>
  )
}
