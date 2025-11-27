/**
 * Mobile & Responsive Configuration
 * Centralized settings for mobile experience, breakpoints, and accessibility
 * 
 * NO HARDCODED VALUES - Everything configurable here
 */

export const MOBILE_CONFIG = {
  // Screen breakpoints (px)
  breakpoints: {
    mobile: 320,
    small: 480,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
    ultrawide: 1536,
  },

  // Touch targets (minimum tap area - WCAG recommended 44x44px)
  touchTargets: {
    minHeight: 44,
    minWidth: 44,
    padding: 8,
  },

  // Font scaling for accessibility
  fontScaling: {
    minZoom: 0.8,  // Minimum allowed zoom level
    maxZoom: 2.0,  // Maximum allowed zoom level
    defaultZoom: 1.0,
    scalingFactor: 0.1, // Increment per zoom step
  },

  // Responsive container sizing
  containers: {
    // Mobile safe areas (accounting for notches, home indicators)
    safeAreaTop: "var(--safe-area-inset-top, 0px)",
    safeAreaBottom: "var(--safe-area-inset-bottom, 0px)",
    safeAreaLeft: "var(--safe-area-inset-left, 0px)",
    safeAreaRight: "var(--safe-area-inset-right, 0px)",

    // Padding by breakpoint
    paddingMobile: 12,
    paddingTablet: 16,
    paddingDesktop: 24,

    // Maximum content width
    maxWidth: {
      mobile: "100%",
      tablet: "728px",
      desktop: "1024px",
      wide: "1280px",
    },
  },

  // Header sizing
  header: {
    heightMobile: 56,  // 3.5rem
    heightTablet: 64,  // 4rem
    heightDesktop: 80, // 5rem
  },

  // Bottom navigation (for mobile-first apps)
  bottomNav: {
    heightMobile: 64,  // Space to reserve at bottom
    heightTablet: 0,   // Hidden on tablet+
  },

  // Grid configuration
  grid: {
    columnsMobile: 1,
    columnsSmall: 2,
    columnsTablet: 2,
    columnsDesktop: 3,
    columnsWide: 4,
  },

  // Spacing scale
  spacing: {
    xs: 4,      // 0.25rem
    sm: 8,      // 0.5rem
    md: 12,     // 0.75rem
    lg: 16,     // 1rem
    xl: 20,     // 1.25rem
    xxl: 24,    // 1.5rem
    xxxl: 32,   // 2rem
  },

  // Typography scaling
  typography: {
    // Mobile-first sizing
    h1Mobile: 24,
    h2Mobile: 20,
    h3Mobile: 18,
    bodyMobile: 14,

    // Tablet sizing
    h1Tablet: 32,
    h2Tablet: 24,
    h3Tablet: 20,
    bodyTablet: 16,

    // Desktop sizing
    h1Desktop: 40,
    h2Desktop: 28,
    h3Desktop: 24,
    bodyDesktop: 16,
  },

  // Animation & transition settings
  animations: {
    transitionDuration: 300, // ms
    reduceMotion: true, // Respect prefers-reduced-motion
  },

  // Public pages (no logout button visible)
  publicPages: [
    "/",
    "/landing",
    "/pricing",
    "/contact",
    "/help",
    "/terms-of-service",
    "/privacy-policy",
    "/login",
    "/register",
    "/custom-login",
    "/custom-register",
  ],
} as const;

export type MobileConfig = typeof MOBILE_CONFIG;
