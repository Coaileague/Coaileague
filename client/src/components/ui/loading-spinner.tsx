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
            "animate-spin rounded-full border-4 border-gray-200",
            sizeClasses[size]
          )}
          style={{
            borderTopColor: "#10b981", // Emergency Green
            animation: "spin 0.8s linear infinite",
          }}
        />
        <div
          className={cn(
            "absolute inset-0 animate-pulse rounded-full",
            sizeClasses[size]
          )}
          style={{
            background: "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)",
          }}
        />
      </div>
      {text && (
        <p className="text-sm font-semibold text-gray-700 animate-pulse">
          {text}
        </p>
      )}
    </div>
  )
}

export function LoadingOverlay({ text }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 border-2 border-emerald-500">
        <LoadingSpinner size="lg" />
        {text && (
          <p className="text-base font-bold text-gray-900 dark:text-gray-100">
            {text}
          </p>
        )}
      </div>
    </div>
  )
}
