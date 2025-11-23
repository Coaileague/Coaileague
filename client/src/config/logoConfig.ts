/**
 * AutoForce™ Logo Configuration - Premium High-Tech Design
 * 
 * Modern, professional logo system with smooth animations
 * Edit once, updates everywhere instantly
 */

export const logoConfig = {
  // Brand identity
  brand: {
    name: "AutoForce",
    trademark: "™",
    tagline: "Autonomous Workforce Management",
    taglineAlt: "Autonomous Management Solutions",
  },

  // Professional color palette
  colors: {
    primary: "hsl(var(--primary))",
    accent: "hsl(217, 91%, 60%)",
    success: "hsl(142, 71%, 45%)",
    white: "hsl(0, 0%, 100%)",
    dark: "hsl(215, 28%, 17%)",
    foreground: "currentColor",
    mutedForeground: "hsl(var(--muted-foreground))",
    glassDark: "rgba(30, 41, 59, 0.7)",
    glassLight: "rgba(255, 255, 255, 0.7)",
  },

  // Badge/Icon sizes
  sizes: {
    badge: {
      sm: { container: "w-10 h-10", text: "text-sm" },
      md: { container: "w-14 h-14", text: "text-lg" },
      lg: { container: "w-20 h-20", text: "text-2xl" },
      xl: { container: "w-28 h-28", text: "text-4xl" },
      hero: { container: "w-40 h-40", text: "text-6xl" },
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

  // Modern animations
  animations: {
    // Icon pulse with scale effect
    iconPulse: {
      enabled: true,
      keyframes: `
        @keyframes icon-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
      `,
      duration: "3s",
      timingFunction: "cubic-bezier(0.4, 0, 0.6, 1)",
    },

    // Smooth glow effect
    glow: {
      enabled: true,
      keyframes: `
        @keyframes glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.4)); }
          50% { filter: drop-shadow(0 0 16px rgba(59, 130, 246, 0.8)); }
        }
      `,
      duration: "4s",
      timingFunction: "ease-in-out",
    },

    // Rotating accent ring
    rotateRing: {
      enabled: true,
      keyframes: `
        @keyframes rotate-ring {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `,
      duration: "20s",
      timingFunction: "linear",
    },

    // Shimmer effect for premium feel
    shimmer: {
      enabled: true,
      keyframes: `
        @keyframes shimmer {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `,
      duration: "2.5s",
      timingFunction: "ease-in-out",
    },
  },

  // New premium icon design - Modern geometric "A" with tech elements
  icon: {
    style: "premium-modern",
    background: {
      type: "gradient-radial",
      colors: ["hsl(var(--primary), 1)", "hsl(217, 91%, 60%, 1)"],
      animated: true,
      animationType: "glow", // applies glow animation
    },
    shape: {
      type: "circle", // or "hexagon", "rounded-square"
      border: {
        enabled: true,
        width: "1.5px",
        color: "rgba(255, 255, 255, 0.3)",
        animated: true,
      },
      shadow: "0 12px 32px rgba(59, 130, 246, 0.3)",
    },
    content: {
      type: "geometric-a", // geometric letter A with accent lines
      color: "white",
      weight: 900,
      renderAs: "svg", // render as SVG for smooth animations
    },
  },

  // Geometric "A" SVG design
  geometricA: {
    viewBox: "0 0 100 100",
    paths: [
      {
        // Left diagonal line
        d: "M 30 80 L 50 20",
        stroke: "currentColor",
        strokeWidth: "6",
        strokeLinecap: "round",
      },
      {
        // Right diagonal line
        d: "M 70 80 L 50 20",
        stroke: "currentColor",
        strokeWidth: "6",
        strokeLinecap: "round",
      },
      {
        // Horizontal crossbar with accent
        d: "M 38 55 L 62 55",
        stroke: "currentColor",
        strokeWidth: "5",
        strokeLinecap: "round",
      },
      {
        // Tech accent - small circles at intersections
        type: "circle",
        cx: "50",
        cy: "25",
        r: "3",
        fill: "hsl(60, 100%, 50%)",
        animated: true,
        animation: "pulse",
      },
    ],
  },

  // Badge styling
  badge: {
    shape: "rounded-full",
    gradient: "bg-gradient-to-br from-primary to-accent",
    shadow: "shadow-xl",
    border: {
      enabled: true,
      color: "border-white/20",
      width: "border",
    },
    text: {
      weight: "font-black",
      color: "text-white",
      content: "A",
      renderAs: "svg", // use geometric design
    },
    hoverEffect: "scale-up-subtle", // smooth 5% scale on hover
  },

  // SVG gradients
  gradients: {
    primary: {
      id: "primaryGradient",
      type: "radial",
      stops: [
        { offset: "0%", color: "hsl(var(--primary))" },
        { offset: "100%", color: "hsl(217, 91%, 60%)" },
      ],
    },
    accent: {
      id: "accentGradient",
      type: "linear",
      angle: "135deg",
      stops: [
        { offset: "0%", color: "hsl(217, 91%, 60%)" },
        { offset: "100%", color: "hsl(var(--primary))" },
      ],
    },
    glow: {
      id: "glowGradient",
      type: "radial",
      stops: [
        { offset: "0%", color: "rgba(59, 130, 246, 0.4)" },
        { offset: "100%", color: "rgba(59, 130, 246, 0)" },
      ],
    },
  },

  // Typography
  typography: {
    fontFamily: "'Inter', '-apple-system', 'Segoe UI', sans-serif",
    fontSize: {
      main: "36",
      tagline: "12",
    },
    fontWeight: {
      main: "700",
      tagline: "500",
    },
    letterSpacing: {
      main: "-0.5",
      tagline: "2",
    },
    textTransform: "uppercase",
  },

  // Spacing
  spacing: {
    badge: { gap: 3 },
    text: { gap: 2 },
  },

  // Responsive
  responsive: {
    mobileScale: 0.95,
  },

  // Accessibility
  accessibility: {
    ariaLabel: "AutoForce™ - Autonomous Workforce Management Platform",
    testIdPrefix: "logo",
  },
};

/**
 * Get logo size for a variant
 */
export function getLogoSize(size: keyof typeof logoConfig.sizes.badge) {
  return logoConfig.sizes.badge[size];
}

/**
 * Get animation config
 */
export function getAnimationConfig(name: keyof typeof logoConfig.animations) {
  return logoConfig.animations[name];
}

/**
 * Check if animation is enabled
 */
export function isAnimationEnabled(name: keyof typeof logoConfig.animations) {
  return logoConfig.animations[name].enabled;
}
