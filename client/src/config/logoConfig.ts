/**
 * AutoForce™ Logo Configuration
 * 
 * Centralized logo design system: edit once, updates everywhere instantly
 * Contains colors, sizes, animations, and design elements for all logo variants
 */

export const logoConfig = {
  // Brand name and trademark
  brand: {
    name: "AutoForce",
    trademark: "™",
    tagline: "Autonomous Workforce Management",
    taglineAlt: "Autonomous Management Solutions",
  },

  // Colors - using CSS variable references for dark/light mode support
  colors: {
    primary: "hsl(var(--primary))",
    accent: "hsl(217, 91%, 60%)", // Bright blue accent
    white: "hsl(0, 0%, 100%)",
    dark: "hsl(0, 0%, 0%)",
    foreground: "currentColor",
    mutedForeground: "hsl(var(--muted-foreground))",
  },

  // Size mappings for all logo variants
  sizes: {
    badge: {
      sm: { container: "w-10 h-10", text: "text-sm" },
      md: { container: "w-14 h-14", text: "text-lg" },
      lg: { container: "w-16 h-16", text: "text-xl" },
      xl: { container: "w-20 h-20", text: "text-2xl" },
      hero: { container: "w-28 h-28", text: "text-4xl" },
    },
    text: {
      sm: "text-2xl",
      md: "text-3xl",
      lg: "text-4xl",
      xl: "text-5xl",
      hero: "text-6xl",
    },
    tagline: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
      xl: "text-lg",
      hero: "text-xl",
    },
    svg: {
      sm: "w-48 h-14",
      md: "w-64 h-20",
      lg: "w-80 h-24",
      xl: "w-96 h-28",
    },
  },

  // Animations
  animations: {
    pulse: {
      enabled: true,
      class: "animate-pulse-slow",
    },
    rotate: {
      enabled: true,
      duration: "20s",
    },
    lightningBolt: {
      enabled: true,
      duration: "1.5s",
      delay: "0.5s",
      intensity: 0.8, // 0-1, controls opacity
    },
  },

  // Lightning bolt effect configuration
  lightningBolt: {
    enabled: true,
    color: "hsl(60, 100%, 50%)", // Bright yellow
    shadowColor: "hsl(40, 100%, 60%)", // Golden glow
    strokeWidth: 2,
    glowFilter: true,
    paths: [
      // Define lightning bolt path segments
      {
        d: "M 15 5 L 18 12 L 12 12 L 20 25",
        opacity: 1,
      },
      {
        d: "M 18 12 L 15 18 L 19 18 L 14 25",
        opacity: 0.7,
      },
    ],
  },

  // AF Badge (circular icon) configuration
  badge: {
    shape: "rounded-full",
    gradient: "bg-gradient-to-br from-primary to-accent",
    shadow: "shadow-lg",
    border: {
      enabled: false,
      color: "border-primary/20",
      width: "border",
    },
    text: {
      weight: "font-black",
      color: "text-white",
      content: "AF",
    },
  },

  // Gradients for SVG logos
  gradients: {
    primary: {
      id: "primaryGradient",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%",
      stops: [
        { offset: "0%", color: "hsl(var(--primary))" },
        { offset: "100%", color: "hsl(217, 91%, 60%)" },
      ],
    },
    accent: {
      id: "accentGradient",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "0%",
      stops: [
        { offset: "0%", color: "hsl(217, 91%, 60%)" },
        { offset: "100%", color: "hsl(var(--primary))" },
      ],
    },
  },

  // Typography
  typography: {
    fontFamily: "'Inter', 'Segoe UI', 'Arial', sans-serif",
    fontSize: {
      main: "32",
      trademark: "32",
      tagline: "11",
    },
    fontWeight: {
      main: "700",
      trademark: "700",
      tagline: "400",
    },
    letterSpacing: {
      main: "-1",
      tagline: "1.5",
    },
  },

  // Network icon (for full logos)
  networkIcon: {
    enabled: true,
    centralHub: {
      size: 8,
      animationDuration: "2s",
      initialOpacity: 1,
    },
    orbitalNodes: {
      size: 5,
      count: 4,
      positions: [
        { x: 10, y: 15 },
        { x: 50, y: 15 },
        { x: 10, y: 45 },
        { x: 50, y: 45 },
      ],
    },
    connections: {
      strokeWidth: 2,
      opacity: 0.4,
    },
    outerRing: {
      radius: 28,
      strokeWidth: 2,
      opacity: 0.3,
      animationDuration: "20s",
    },
  },

  // Spacing and layout
  spacing: {
    badge: {
      gap: 4,
    },
    full: {
      gap: 4,
    },
    contentGap: 2,
  },

  // Responsive behavior
  responsive: {
    mobileBreakpoint: "md",
    scaleOnMobile: 0.9,
  },

  // Accessibility
  accessibility: {
    ariaLabel: "AutoForce™ - Autonomous Workforce Management Platform",
    testIdPrefix: "logo",
  },
};

/**
 * Get logo size configuration for a specific size key
 * Usage: getLogoSize('md')
 */
export function getLogoSize(size: keyof typeof logoConfig.sizes.badge) {
  return logoConfig.sizes.badge[size];
}

/**
 * Get lightning bolt configuration
 * Usage: getLightningBoltConfig()
 */
export function getLightningBoltConfig() {
  return logoConfig.lightningBolt;
}

/**
 * Get animation configuration
 * Usage: getAnimationConfig('lightningBolt')
 */
export function getAnimationConfig(type: keyof typeof logoConfig.animations) {
  return logoConfig.animations[type];
}

/**
 * Check if a feature is enabled
 * Usage: isLogoFeatureEnabled('lightningBolt')
 */
export function isLogoFeatureEnabled(feature: "lightningBolt" | "pulse" | "rotate" | "networkIcon") {
  switch (feature) {
    case "lightningBolt":
      return logoConfig.lightningBolt.enabled;
    case "pulse":
      return logoConfig.animations.pulse.enabled;
    case "rotate":
      return logoConfig.animations.rotate.enabled;
    case "networkIcon":
      return logoConfig.networkIcon.enabled;
    default:
      return false;
  }
}
