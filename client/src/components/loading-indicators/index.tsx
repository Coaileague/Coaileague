/**
 * Simple loading indicator stub
 * Provides a minimal replacement for the deleted ResponsiveLoading component
 */

interface LoadingProps {
  message?: string;
  progress?: number;
}

export function ResponsiveLoading({ message, progress }: LoadingProps) {
  return (
    <div className="fixed inset-0 z-[99999] bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {progress !== undefined && <p className="text-xs text-muted-foreground">{progress}%</p>}
      </div>
    </div>
  );
}
