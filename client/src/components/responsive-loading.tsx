import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";
import {
  DesktopLoadingVariant1,
  DesktopLoadingVariant2,
  DesktopLoadingVariant3,
  MobileLoadingVariant1,
  MobileLoadingVariant2,
  MobileLoadingVariant3,
} from "./loading-variants";

interface ResponsiveLoadingProps {
  message?: string;
  progress?: number;
}

// Desktop variants pool
const DESKTOP_VARIANTS = [
  DesktopLoadingVariant1,
  DesktopLoadingVariant2,
  DesktopLoadingVariant3,
];

// Mobile variants pool
const MOBILE_VARIANTS = [
  MobileLoadingVariant1,
  MobileLoadingVariant2,
  MobileLoadingVariant3,
];

/**
 * Responsive Loading Component
 * 
 * Automatically selects from 6 loading variants (3 desktop + 3 mobile)
 * based on viewport size with random rotation for variety:
 * - Mobile (<768px): Randomly selects from 3 mobile variants
 * - Desktop (≥768px): Randomly selects from 3 desktop variants
 * 
 * All variants show:
 * - Visible percentage (0-100%)
 * - Random professional loading messages
 * - Blue/cyan gradient AutoForce™ branding
 * - Different visual styles (isometric cubes, circular progress, wave animations, etc.)
 * 
 * Use this for auth gates, access loading, and page-level loading states
 */
export function ResponsiveLoading({ message, progress }: ResponsiveLoadingProps) {
  const isMobile = useIsMobile();
  const [VariantComponent, setVariantComponent] = useState(() => 
    isMobile ? MOBILE_VARIANTS[0] : DESKTOP_VARIANTS[0]
  );
  
  // Select random variant on mount and when viewport changes
  useEffect(() => {
    const variants = isMobile ? MOBILE_VARIANTS : DESKTOP_VARIANTS;
    const randomIndex = Math.floor(Math.random() * variants.length);
    setVariantComponent(() => variants[randomIndex]);
  }, [isMobile]);
  
  // All variants are fullscreen by design
  return <VariantComponent message={message} progress={progress} />;
}

/**
 * Fullscreen variant alias for backwards compatibility
 */
export function ResponsiveLoadingFullscreen({ message, progress }: ResponsiveLoadingProps) {
  return <ResponsiveLoading message={message} progress={progress} />;
}
