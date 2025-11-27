/**
 * CoAIleague Logo Configuration - Premium Autonomous Platform Design
 * 
 * Sophisticated icon representing autonomous workforce management:
 * - Central core (the platform)
 * - Connected nodes (autonomous agents/workers)
 * - Flowing energy/connections (coordination)
 * - Smooth animations showing autonomous operation
 */

export const logoConfig = {
  brand: {
    name: "CoAIleague",
    trademark: "™",
    tagline: "Autonomous Workforce Management",
    taglineAlt: "Autonomous Management Solutions",
  },

  colors: {
    primary: "hsl(var(--primary))",
    accent: "hsl(217, 91%, 60%)",
    white: "hsl(0, 0%, 100%)",
    foreground: "currentColor",
    mutedForeground: "hsl(var(--muted-foreground))",
  },

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

  animations: {
    pulseCore: {
      enabled: true,
      duration: "2s",
      keyframes: `
        @keyframes pulse-core {
          0%, 100% { r: 5; opacity: 1; }
          50% { r: 7; opacity: 0.8; }
        }
      `,
    },
    flowNode: {
      enabled: true,
      duration: "3s",
      keyframes: `
        @keyframes flow-node {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `,
    },
    rotateRing: {
      enabled: true,
      duration: "20s",
      keyframes: `
        @keyframes rotate-ring {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `,
    },
    flowEnergy: {
      enabled: true,
      duration: "2.5s",
      keyframes: `
        @keyframes flow-energy {
          0% { strokeDashoffset: 100; opacity: 0; }
          50% { opacity: 1; }
          100% { strokeDashoffset: 0; opacity: 0; }
        }
      `,
    },
    glowPulse: {
      enabled: true,
      duration: "3s",
      keyframes: `
        @keyframes glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.3)); }
          50% { filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.6)); }
        }
      `,
    },
  },

  icon: {
    type: "autonomous-network",
    description: "Connected nodes representing autonomous workforce coordination",
    viewBox: "0 0 100 100",
    animated: true,
  },

  badge: {
    shape: "rounded-full",
    gradient: "bg-gradient-to-br from-primary to-accent",
    shadow: "shadow-xl",
    border: {
      enabled: true,
      color: "border-white/20",
      width: "border",
    },
  },

  gradients: {
    primary: {
      id: "primaryGradient",
      type: "radial",
      stops: [
        { offset: "0%", color: "hsl(var(--primary))" },
        { offset: "100%", color: "hsl(217, 91%, 60%)" },
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

  typography: {
    fontFamily: "'Inter', '-apple-system', 'Segoe UI', sans-serif",
    fontSize: { main: "36", tagline: "12" },
    fontWeight: { main: "700", tagline: "500" },
    letterSpacing: { main: "-0.5", tagline: "2" },
  },

  accessibility: {
    ariaLabel: "CoAIleague - Autonomous Workforce Management Platform",
    testIdPrefix: "logo",
  },
};

export function getLogoSize(size: keyof typeof logoConfig.sizes.badge) {
  return logoConfig.sizes.badge[size];
}

export function isAnimationEnabled(name: keyof typeof logoConfig.animations) {
  return logoConfig.animations[name].enabled;
}

export function getAnimationConfig(name: keyof typeof logoConfig.animations) {
  return logoConfig.animations[name];
}
