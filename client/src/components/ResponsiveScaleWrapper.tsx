/**
 * Responsive Scale Wrapper
 * Auto-scales content for accessibility and small screens
 * Handles zoom levels and ensures readable content everywhere
 * 
 * Features:
 * - Auto-scales for small screens (320px+)
 * - Adapts to user zoom/text size preferences
 * - Maintains readable font sizes
 * - Responsive touch targets
 * - Built-in safe area support
 */

import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MOBILE_CONFIG } from "@/config/mobileConfig";

interface ResponsiveScaleWrapperProps {
  children: ReactNode;
  className?: string;
}

export function ResponsiveScaleWrapper({
  children,
  className,
}: ResponsiveScaleWrapperProps) {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    // Detect if screen is small (mobile)
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < MOBILE_CONFIG.breakpoints.tablet);
    };

    // Detect zoom/text scale level
    const checkZoom = () => {
      const zoom = window.devicePixelRatio || 1;
      setZoomLevel(Math.max(zoom, 1));
    };

    checkScreenSize();
    checkZoom();

    const handleResize = checkScreenSize;
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className={cn(
        "responsive-scale-wrapper",
        "w-full h-full overflow-auto",
        isSmallScreen && "mobile-optimized",
        className
      )}
      style={{
        "--responsive-scale": Math.max(0.9, Math.min(1.1, zoomLevel)),
      } as React.CSSProperties}
    >
      {/* Safety wrapper for extreme zoom levels */}
      <div
        className="w-full h-full"
        style={{
          transform: zoomLevel > 1.5 ? `scale(${1 / zoomLevel})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Mobile Safe Container
 * Wraps content with safe area insets
 */
interface MobileSafeContainerProps {
  children: ReactNode;
  className?: string;
}

export function MobileSafeContainer({
  children,
  className,
}: MobileSafeContainerProps) {
  return (
    <div
      className={cn("w-full h-full", className)}
      style={{
        paddingTop: MOBILE_CONFIG.containers.safeAreaTop,
        paddingBottom: MOBILE_CONFIG.containers.safeAreaBottom,
        paddingLeft: MOBILE_CONFIG.containers.safeAreaLeft,
        paddingRight: MOBILE_CONFIG.containers.safeAreaRight,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Adaptive Container
 * Scales responsively based on breakpoints
 */
interface AdaptiveContainerProps {
  children: ReactNode;
  className?: string;
}

export function AdaptiveContainer({
  children,
  className,
}: AdaptiveContainerProps) {
  return (
    <div
      className={cn(
        "w-full",
        "px-3 sm:px-4 md:px-6 lg:px-8",
        "py-4 sm:py-6 md:py-8",
        "mx-auto",
        className
      )}
      style={{
        maxWidth: "min(100%, 1280px)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Accessible Typography
 * Auto-scales text based on device and zoom
 */
interface AccessibleHeadingProps {
  level?: "h1" | "h2" | "h3" | "h4";
  children: ReactNode;
  className?: string;
}

export function AccessibleHeading({
  level = "h1",
  children,
  className,
}: AccessibleHeadingProps) {
  const headingClass = {
    h1: "text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold",
    h2: "text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold",
    h3: "text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold",
    h4: "text-base sm:text-lg md:text-xl lg:text-2xl font-semibold",
  };

  const Element = level;

  return (
    <Element
      className={cn(
        headingClass[level],
        "leading-tight",
        "break-words",
        className
      )}
    >
      {children}
    </Element>
  );
}

/**
 * Accessible Body Text
 * Ensures readable font size on all screens
 */
interface AccessibleTextProps {
  children: ReactNode;
  className?: string;
  size?: "sm" | "base" | "lg";
}

export function AccessibleText({
  children,
  className,
  size = "base",
}: AccessibleTextProps) {
  const sizeClass = {
    sm: "text-sm sm:text-base md:text-base",
    base: "text-base sm:text-base md:text-lg",
    lg: "text-lg sm:text-lg md:text-xl",
  };

  return (
    <p className={cn(sizeClass[size], "leading-relaxed", className)}>
      {children}
    </p>
  );
}
