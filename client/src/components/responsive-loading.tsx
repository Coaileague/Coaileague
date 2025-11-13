import { useIsMobile } from "@/hooks/use-mobile";
import { MobileLoading } from "./mobile-loading";
import { UniversalLoading } from "./universal-loading";

interface ResponsiveLoadingProps {
  message?: string;
  fullScreen?: boolean;
  progress?: number;
}

/**
 * Responsive Loading Component
 * 
 * Automatically switches between MobileLoading and UniversalLoading
 * based on viewport size:
 * - Mobile (<768px): Shows MobileLoading with progress bar and percentages
 * - Desktop (≥768px): Shows UniversalLoading with AutoForce logo and wave animation
 * 
 * Use this for auth gates, access loading, and page-level loading states
 */
export function ResponsiveLoading({ message, fullScreen = false, progress }: ResponsiveLoadingProps) {
  const isMobile = useIsMobile();
  
  if (isMobile) {
    return <MobileLoading message={message} fullScreen={fullScreen} progress={progress} />;
  }
  
  return <UniversalLoading message={message} fullScreen={fullScreen} />;
}

/**
 * Fullscreen variant - always renders fullscreen
 */
export function ResponsiveLoadingFullscreen({ message, progress }: Omit<ResponsiveLoadingProps, 'fullScreen'>) {
  return <ResponsiveLoading message={message} fullScreen={true} progress={progress} />;
}
