/**
 * Disabled loading indicator
 * CRITICAL: This component was causing blocking issues on app boot
 * It has been disabled to prevent workspace access being blocked
 * All loading states now use UniversalTransitionOverlay instead
 */

interface LoadingProps {
  message?: string;
  progress?: number;
}

export function ResponsiveLoading({ message, progress }: LoadingProps) {
  // DISABLED: This was blocking workspace access
  // Return null to prevent any rendering
  return null;
}
